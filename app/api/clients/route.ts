import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinorUnits, validateClient } from "@/lib/delivery/validate";
import { isLeadershipRank } from "@/lib/auth/roles";
import { notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";
import { c2cCommissionBreakdown } from "@/lib/finance/c2c";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const { data, errors } = validateClient(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  // Name and code are both unique; report the clash rather than 500ing.
  const clash = await db.client.findFirst({ where: { OR: [{ name: data.name }, { code: data.code }] } });
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
  if (data.vendorId && !vendor) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { vendorId: "That vendor no longer exists." } }, { status: 422 });
  }
  if (data.globalCandidateId && !globalCandidate) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { globalCandidateId: "That Global Candidate no longer exists." } }, { status: 422 });
  }
  if (globalCandidate && globalCandidate.kind !== "GLOBAL") {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { globalCandidateId: "Choose a Global Candidate for a procured job." } }, { status: 422 });
  }
  if (globalCandidate && globalCandidate.consentStatus !== "CONSENTED") {
    return NextResponse.json({ message: "This Global Candidate has not completed profile-marketing consent.", errors: { globalCandidateId: "Consent must be confirmed before a job can be procured." } }, { status: 409 });
  }
  if (data.ownerId && (!owner || owner.status !== "ACTIVE" || !isLeadershipRank(owner.role.rank))) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { ownerId: "Project/account owner must be an active Founder or Co-Founder." } }, { status: 422 });
  }

  const commissionPolicy = policy ?? await db.commissionPolicy.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const isC2C = data.employmentType === "C2C";
  const candidateCommission = isC2C && data.globalCandidateCommissionPercent
    ? Number(data.globalCandidateCommissionPercent)
    : (isC2C && data.globalCandidateId ? commissionPolicy.defaultGlobalCandidateCommissionPercent : null);
  const vendorCommission = isC2C && data.vendorCommissionPercent
    ? Number(data.vendorCommissionPercent)
    : (isC2C && data.vendorId ? commissionPolicy.defaultVendorCommissionPercent : null);
  try {
    if (isC2C && candidateCommission !== null && vendorCommission !== null) {
      // Reuse the single commercial calculator to reject an impossible split
      // before creating a job that could never be invoiced.
      c2cCommissionBreakdown({
        grossClientAmount: 100,
        globalCandidateCommissionPercent: candidateCommission,
        vendorCommissionPercent: vendorCommission,
      });
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid C2C commission configuration.", errors: { vendorCommissionPercent: "Combined commissions cannot exceed 100%." } }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    // The one policy is the only source of defaults; per-client values are an
    // intentional historical snapshot, not a second calculation path.
    const actualClientRate = toMinorUnits(data.actualClientRate);
    const client = await tx.client.create({
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
        rateCurrency: data.rateCurrency || "USD",
        globalCandidateCommissionPercent: candidateCommission,
        vendorCommissionPercent: vendorCommission,
      },
    });

    // A procured Global Candidate job gets one minimal internal project. A
    // general client record deliberately remains a client-only record.
    const project = data.globalCandidateId ? await tx.project.create({
      data: {
        clientId: client.id,
        name: data.projectName,
        code: `${client.code}-JOB`,
        status: client.status === "UPCOMING" ? "PLANNED" : "ACTIVE",
        billing: "TIME_AND_MATERIALS",
        defaultRate: actualClientRate,
        budgetCurrency: data.rateCurrency || "USD",
        startDate: client.startDate,
        endDate: client.endDate,
        managerId: client.ownerId,
      },
    }) : null;
    if (project) await tx.projectTask.create({ data: { projectId: project.id, name: "General", billable: true, sortOrder: 0 } });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: `New Client / Job: ${client.name}`,
      body: `${context.user.name} created ${client.name}${globalCandidate ? ` for ${globalCandidate.name}` : ""}${vendor ? ` via ${vendor.name}` : ""}.${project ? ` Internal project ${project.code} was created automatically.` : ""}`,
      link: "/clients",
    }, tx);
    await recordAudit({ actorId: context.user.id, action: "client.create", entityType: "Client", entityId: client.id, after: { name: client.name, code: client.code, vendorId: client.vendorId, globalCandidateId: client.globalCandidateId, projectId: project?.id ?? null, actualClientRate }, ipAddress: clientIp(request) }, tx);
    return { client, project };
  });

  return NextResponse.json({ message: created.project ? `${created.client.name} added and internal project ${created.project.code} created.` : `${created.client.name} added.`, id: created.client.id, projectId: created.project?.id ?? null });
}
