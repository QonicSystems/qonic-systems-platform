import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type ContactErrors = Partial<Record<"name" | "email" | "phone" | "title", string>>;

function readContact(input: Record<string, unknown>) {
  const data = {
    name: String(input.name ?? "").trim().slice(0, 200),
    email: String(input.email ?? "").trim().toLowerCase().slice(0, 320),
    phone: String(input.phone ?? "").trim().slice(0, 50),
    title: String(input.title ?? "").trim().slice(0, 200),
    isPrimary: input.isPrimary === true,
  };
  const errors: ContactErrors = {};
  if (data.name.length < 2) errors.name = "Enter the contact's name.";
  if (data.email && !emailPattern.test(data.email)) errors.email = "Enter a valid email address.";
  if (data.phone && !/^[+\d][\d\s()-]{5,}$/.test(data.phone)) errors.phone = "Enter a valid phone number.";
  return { data, errors };
}

/** Add a contact to a client. Requires client.manage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  const { id } = await params;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ message: "That client no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const { data, errors } = readContact(typeof body === "object" && body !== null ? body as Record<string, unknown> : {});
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const created = await db.$transaction(async (tx) => {
    // Exactly one primary per client, so promoting one demotes the rest.
    if (data.isPrimary) await tx.clientContact.updateMany({ where: { clientId: id }, data: { isPrimary: false } });
    const contact = await tx.clientContact.create({
      data: { clientId: id, name: data.name, email: data.email || null, phone: data.phone || null, title: data.title || null, isPrimary: data.isPrimary },
    });
    await recordAudit({
      actorId: context.user.id, action: "client.contact.create", entityType: "Client", entityId: id,
      after: { name: data.name, email: data.email }, ipAddress: clientIp(request),
    }, tx);
    return contact;
  });

  return NextResponse.json({ message: `${created.name} added to ${client.name}.`, id: created.id });
}

/** Edit a contact. Requires client.manage. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const contactId = String(input.contactId ?? "");
  const contact = await db.clientContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.clientId !== id) return NextResponse.json({ message: "That contact could not be found." }, { status: 404 });

  const { data, errors } = readContact(input);
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  await db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.clientContact.updateMany({ where: { clientId: id, NOT: { id: contactId } }, data: { isPrimary: false } });
    await tx.clientContact.update({
      where: { id: contactId },
      data: { name: data.name, email: data.email || null, phone: data.phone || null, title: data.title || null, isPrimary: data.isPrimary },
    });
    await recordAudit({
      actorId: context.user.id, action: "client.contact.update", entityType: "Client", entityId: id,
      before: { name: contact.name }, after: { name: data.name }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${data.name} updated.` });
}

/** Remove a contact. Nothing references it, so this is a plain delete. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  const { id } = await params;
  const contactId = new URL(request.url).searchParams.get("contactId") ?? "";
  const contact = await db.clientContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.clientId !== id) return NextResponse.json({ message: "That contact could not be found." }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.clientContact.delete({ where: { id: contactId } });
    await recordAudit({
      actorId: context.user.id, action: "client.contact.delete", entityType: "Client", entityId: id,
      before: { name: contact.name }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${contact.name} removed.` });
}
