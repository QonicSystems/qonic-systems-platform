import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { CLIENT_STATUSES, toMinorUnits, validateClient } from "@/lib/delivery/validate";
import { isLeadershipRank } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { c2cCommissionBreakdown } from "@/lib/finance/c2c";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "That client no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  // Archiving and restoring change one field. Routing them through the full
  // validator would demand name, code and the rest be resent, which a row-level
  // action does not have — the same shortcut the project route gives `health`.
  if (Object.keys(input).length === 1 && typeof input.status === "string") {
    const status = input.status;
    if (!CLIENT_STATUSES.includes(status as typeof CLIENT_STATUSES[number])) {
      return NextResponse.json({ message: "That is not a valid client status." }, { status: 400 });
    }
    if (existing.status === status) {
      return NextResponse.json({ message: `${existing.name} is already ${status.toLowerCase()}.` }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { status: status as never } });
      await recordAudit({
        actorId: context.user.id, action: "client.status", entityType: "Client", entityId: id,
        before: { status: existing.status }, after: { status }, ipAddress: clientIp(request),
      }, tx);
    });
    return NextResponse.json({ message: `${existing.name} is now ${status.toLowerCase()}.` });
  }

  const { data, errors } = validateClient(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const clash = await db.client.findFirst({ where: { OR: [{ name: data.name }, { code: data.code }], NOT: { id } } });
  if (clash) {
    return NextResponse.json({
      message: "Please correct the highlighted fields.",
      errors: clash.code === data.code ? { code: "Another client already uses that code." } : { name: "A client with that name already exists." },
    }, { status: 422 });
  }

  const [vendor, globalCandidate, owner, policy] = await Promise.all([
    data.vendorId ? db.vendor.findUnique({ where: { id: data.vendorId } }) : Promise.resolve(null),
    data.globalCandidateId ? db.candidate.findUnique({ where: { id: data.globalCandidateId } }) : Promise.resolve(null),
    data.ownerId ? db.user.findUnique({ where: { id: data.ownerId }, include: { role: true } }) : Promise.resolve(null),
    db.commissionPolicy.findUnique({ where: { id: "default" } }),
  ]);
  if (data.vendorId && !vendor) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { vendorId: "That vendor no longer exists." } }, { status: 422 });
  if (data.globalCandidateId && (!globalCandidate || globalCandidate.kind !== "GLOBAL")) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { globalCandidateId: "Choose a Global Candidate for this job." } }, { status: 422 });
  if (globalCandidate && globalCandidate.consentStatus !== "CONSENTED") return NextResponse.json({ message: "This Global Candidate has not completed profile-marketing consent.", errors: { globalCandidateId: "Consent must be confirmed before a job can be procured." } }, { status: 409 });
  if (data.ownerId && (!owner || owner.status !== "ACTIVE" || !isLeadershipRank(owner.role.rank))) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { ownerId: "Project/account owner must be an active Founder or Co-Founder." } }, { status: 422 });

  const actualClientRate = toMinorUnits(data.actualClientRate);
  const commissionPolicy = policy ?? await db.commissionPolicy.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const isC2C = data.employmentType === "C2C";
  const candidateCommission = isC2C && data.globalCandidateCommissionPercent
    ? Number(data.globalCandidateCommissionPercent)
    : (isC2C && data.globalCandidateId ? existing.globalCandidateCommissionPercent ?? commissionPolicy.defaultGlobalCandidateCommissionPercent : null);
  const vendorCommission = isC2C && data.vendorCommissionPercent
    ? Number(data.vendorCommissionPercent)
    : (isC2C && data.vendorId ? existing.vendorCommissionPercent ?? commissionPolicy.defaultVendorCommissionPercent : null);
  try {
    if (isC2C && candidateCommission !== null && vendorCommission !== null) {
      c2cCommissionBreakdown({
        grossClientAmount: 100,
        globalCandidateCommissionPercent: candidateCommission,
        vendorCommissionPercent: vendorCommission,
      });
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid C2C commission configuration.", errors: { vendorCommissionPercent: "Combined commissions cannot exceed 100%." } }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.client.update({
      where: { id },
      data: {
        name: data.name, code: data.code, status: data.status as never,
        industry: data.industry || null, website: data.website || null,
        notes: data.notes || null, ownerId: data.ownerId || null,
        vendorId: data.vendorId || null,
        globalCandidateId: data.globalCandidateId || null,
        employmentType: data.employmentType || null,
        workArrangement: data.workArrangement || null,
        startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
        endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
        actualClientRate,
        rateCurrency: data.rateCurrency || existing.rateCurrency,
        globalCandidateCommissionPercent: candidateCommission,
        vendorCommissionPercent: vendorCommission,
      },
    });
    // Client terms are authoritative for the automatically-created internal
    // project. This keeps dates, manager and the downstream billing rate in
    // sync without asking users to type the same data twice.
    await tx.project.updateMany({
      where: { clientId: id },
      data: {
        startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
        endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
        managerId: data.ownerId || null,
        defaultRate: actualClientRate,
        budgetCurrency: data.rateCurrency || existing.rateCurrency,
      },
    });
    // Existing generic clients can be promoted to a procured Global Candidate
    // job later. Create its minimal internal project exactly once at that
    // point, preserving the same Client → Project data flow as new jobs.
    if (data.globalCandidateId) {
      const hasProject = await tx.project.findFirst({ where: { clientId: id }, select: { id: true } });
      if (!hasProject) {
        const project = await tx.project.create({
          data: {
            clientId: id, name: data.projectName, code: `${data.code}-JOB`,
            status: data.status === "UPCOMING" ? "PLANNED" : "ACTIVE",
            billing: "TIME_AND_MATERIALS", defaultRate: actualClientRate,
            budgetCurrency: data.rateCurrency || existing.rateCurrency,
            startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
            endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
            managerId: data.ownerId || null,
          },
        });
        await tx.projectTask.create({ data: { projectId: project.id, name: "General", billable: true, sortOrder: 0 } });
      }
    }
    await recordAudit({
      actorId: context.user.id, action: "client.update", entityType: "Client", entityId: id,
      before: { name: existing.name, code: existing.code, status: existing.status },
      after: { name: data.name, code: data.code, status: data.status },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${data.name} updated.` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.client.findUnique({
    where: { id },
    include: {
      projects: { select: { id: true } },
      jobs: { select: { id: true } },
      invoices: { select: { id: true } },
    },
  });
  if (!existing) return NextResponse.json({ message: "That client no longer exists." }, { status: 404 });

  await db.$transaction(async (tx) => {
    // 1. Clean up linked Jobs: Applications -> Events, Interviews, Placements -> Jobs
    const jobIds = existing.jobs.map((j) => j.id);
    if (jobIds.length > 0) {
      const applications = await tx.application.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
      const appIds = applications.map((a) => a.id);
      if (appIds.length > 0) {
        await tx.placement.deleteMany({ where: { applicationId: { in: appIds } } });
        await tx.interview.deleteMany({ where: { applicationId: { in: appIds } } });
        await tx.applicationEvent.deleteMany({ where: { applicationId: { in: appIds } } });
        await tx.application.deleteMany({ where: { id: { in: appIds } } });
      }
      await tx.job.deleteMany({ where: { id: { in: jobIds } } });
    }

    // 2. Clean up linked Projects: TimeEntries, Assignments, Milestones, Tasks, Expenses -> Projects
    const projectIds = existing.projects.map((p) => p.id);
    if (projectIds.length > 0) {
      await tx.timeEntry.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectAssignment.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectMilestone.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectTask.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.expense.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    }

    // 3. Clean up linked Invoices: Lines, Payments, CreditNotes -> Invoices
    const invoiceIds = existing.invoices.map((i) => i.id);
    if (invoiceIds.length > 0) {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }

    // 4. Clean up Client Contacts
    await tx.clientContact.deleteMany({ where: { clientId: id } });

    // 5. Audit log and delete
    await recordAudit({
      actorId: context.user.id,
      action: "client.delete",
      entityType: "Client",
      entityId: id,
      before: { name: existing.name, code: existing.code },
      ipAddress: clientIp(request),
    }, tx);
    await tx.client.delete({ where: { id } });
  });

  return NextResponse.json({ message: `${existing.name} permanently removed.` });
}
