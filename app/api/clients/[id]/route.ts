import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { CLIENT_STATUSES, validateClient } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

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

  await db.$transaction(async (tx) => {
    await tx.client.update({
      where: { id },
      data: {
        name: data.name, code: data.code, status: data.status as never,
        industry: data.industry || null, website: data.website || null,
        notes: data.notes || null, ownerId: data.ownerId || null,
      },
    });
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
