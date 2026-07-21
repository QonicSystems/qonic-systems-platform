import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { validateClient } from "@/lib/delivery/validate";
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
    return NextResponse.json({
      message: `${existing.name} has ${projects} project(s), ${jobs} job(s), and ${invoices} invoice(s) on record and cannot be deleted. Set the status to Archived instead.`,
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await recordAudit({ actorId: context.user.id, action: "client.delete", entityType: "Client", entityId: id, before: { name: existing.name, code: existing.code }, ipAddress: clientIp(request) }, tx);
    await tx.client.delete({ where: { id } });
  });

  return NextResponse.json({ message: `${existing.name} removed.` });
}
