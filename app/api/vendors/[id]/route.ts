import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;
  const { id } = await params;
  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ message: "That vendor no longer exists." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const name = String(input.name ?? vendor.name).trim();
  const email = String(input.email ?? vendor.email ?? "").trim().toLowerCase();
  const website = String(input.website ?? vendor.website ?? "").trim();
  const status = String(input.status ?? vendor.status);
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter the vendor company name.";
  if (email && !emailPattern.test(email)) errors.email = "Enter a valid email address.";
  if (website && !/^https?:\/\//i.test(website)) errors.website = "The website must start with http:// or https://";
  if (!['ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED'].includes(status)) errors.status = "Choose a valid vendor status.";
  const duplicate = name !== vendor.name ? await db.vendor.findUnique({ where: { name } }) : null;
  if (duplicate) errors.name = "A vendor with this name already exists.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  await db.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { name, email: email || null, website: website || null, contactName: String(input.contactName ?? vendor.contactName ?? "").trim() || null, phone: String(input.phone ?? vendor.phone ?? "").trim() || null, address: String(input.address ?? vendor.address ?? "").trim() || null, notes: String(input.notes ?? vendor.notes ?? "").trim() || null, status: status as never } });
    await recordAudit({ actorId: context.user.id, action: "vendor.update", entityType: "Vendor", entityId: id, before: { name: vendor.name }, after: { name, status }, ipAddress: clientIp(request) }, tx);
  });
  return NextResponse.json({ message: `${name} updated.` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;
  const { id } = await params;
  const vendor = await db.vendor.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } });
  if (!vendor) return NextResponse.json({ message: "That vendor no longer exists." }, { status: 404 });
  if (vendor._count.clients > 0) return NextResponse.json({ message: "This vendor is linked to jobs. Archive it instead so commercial history stays connected." }, { status: 409 });
  await db.$transaction(async (tx) => {
    await tx.vendor.delete({ where: { id } });
    await recordAudit({ actorId: context.user.id, action: "vendor.delete", entityType: "Vendor", entityId: id, before: { name: vendor.name }, ipAddress: clientIp(request) }, tx);
  });
  return NextResponse.json({ message: `${vendor.name} removed.` });
}
