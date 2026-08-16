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
  const existing = await db.client.findUnique({ where: { id }, include: { _count: { select: { projects: true, jobs: true, invoices: true } } } });
  if (!existing) return NextResponse.json({ message: "That client no longer exists." }, { status: 404 });

  // A client with history is part of the commercial record. Archiving keeps the
  // projects, jobs, and invoices intact and readable.
  const { projects, jobs, invoices } = existing._count;
  if (projects + jobs + invoices > 0) {
    // Only the counts that actually block are named. Listing "0 job(s)" among
    // them made it read as though every category had to be cleared.
    const blockers = [
      projects > 0 ? `${projects} project${projects === 1 ? "" : "s"}` : null,
      jobs > 0 ? `${jobs} job${jobs === 1 ? "" : "s"}` : null,
      invoices > 0 ? `${invoices} invoice${invoices === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return NextResponse.json({
      message: `${existing.name} has ${blockers.join(", ")} on record and cannot be deleted. Archive the client instead — the history stays intact.`,
      blockers: { projects, jobs, invoices },
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await recordAudit({ actorId: context.user.id, action: "client.delete", entityType: "Client", entityId: id, before: { name: existing.name, code: existing.code }, ipAddress: clientIp(request) }, tx);
    await tx.client.delete({ where: { id } });
  });

  return NextResponse.json({ message: `${existing.name} removed.` });
}
