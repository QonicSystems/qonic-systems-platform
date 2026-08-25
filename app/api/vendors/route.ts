import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function vendorInput(body: unknown) {
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const data = {
    name: String(input.name ?? "").trim(),
    contactName: String(input.contactName ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    phone: String(input.phone ?? "").trim(),
    address: String(input.address ?? "").trim(),
    website: String(input.website ?? "").trim(),
    status: String(input.status ?? "ACTIVE").trim(),
    notes: String(input.notes ?? "").trim(),
  };
  const errors: Record<string, string> = {};
  if (data.name.length < 2) errors.name = "Enter the vendor company name.";
  if (data.email && !emailPattern.test(data.email)) errors.email = "Enter a valid email address.";
  if (data.website && !/^https?:\/\//i.test(data.website)) errors.website = "The website must start with http:// or https://";
  if (!['ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED'].includes(data.status)) errors.status = "Choose a valid vendor status.";
  return { data, errors };
}

export async function POST(request: Request) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const { data, errors } = vendorInput(body);
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  if (await db.vendor.findUnique({ where: { name: data.name } })) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { name: "A vendor with this name already exists." } }, { status: 422 });

  const vendor = await db.$transaction(async (tx) => {
    const created = await tx.vendor.create({ data: { ...data, contactName: data.contactName || null, email: data.email || null, phone: data.phone || null, address: data.address || null, website: data.website || null, notes: data.notes || null, status: data.status as never } });
    await recordAudit({ actorId: context.user.id, action: "vendor.create", entityType: "Vendor", entityId: created.id, after: { name: created.name }, ipAddress: clientIp(request) }, tx);
    return created;
  });
  return NextResponse.json({ message: `${vendor.name} added to the Vendor Dashboard.`, id: vendor.id });
}
