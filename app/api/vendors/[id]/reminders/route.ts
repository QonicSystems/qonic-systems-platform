import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { sendEmail } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Dispatches one vendor payment reminder and stores immutable delivery history. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;
  const { id } = await params;
  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ message: "That vendor no longer exists." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const channel = String(input.channel ?? "");
  const clientId = String(input.clientId ?? "").trim() || null;
  if (channel !== "EMAIL" && channel !== "WHATSAPP") return NextResponse.json({ message: "Choose email or WhatsApp." }, { status: 422 });
  const recipient = channel === "EMAIL" ? vendor.email : vendor.phone;
  if (!recipient) return NextResponse.json({ message: `This vendor has no ${channel === "EMAIL" ? "email address" : "phone number"} on record.` }, { status: 422 });
  const client = clientId ? await db.client.findFirst({ where: { id: clientId, vendorId: id } }) : null;
  if (clientId && !client) return NextResponse.json({ message: "That job is not associated with this vendor." }, { status: 422 });
  const message = String(input.message ?? `Friendly reminder from Qonic Systems: please review the outstanding payment${client ? ` for ${client.name}` : ""}.`).trim().slice(0, 1000);
  if (message.length < 3) return NextResponse.json({ message: "Enter a reminder message." }, { status: 422 });

  // A quick double click must not produce two identical chasers. A later
  // follow-up remains possible and is separately recorded in the history.
  const duplicateSince = new Date(Date.now() - 5 * 60_000);
  const duplicate = await db.reminder.findFirst({ where: { vendorId: id, clientId, channel: channel as never, recipient, message, sentAt: { gte: duplicateSince } } });
  if (duplicate) return NextResponse.json({ message: "An identical reminder was already recorded in the last five minutes." }, { status: 409 });

  await db.$transaction(async (tx) => {
    await tx.reminder.create({ data: { vendorId: id, clientId, channel: channel as never, recipient, message, sentById: context.user.id } });
    await recordAudit({ actorId: context.user.id, action: "vendor.reminder", entityType: "Vendor", entityId: id, after: { channel, recipient, clientId }, ipAddress: clientIp(request) }, tx);
  });

  if (channel === "EMAIL") void sendEmail([recipient], "Payment reminder from Qonic Systems", message, "/vendors");
  const whatsappUrl = channel === "WHATSAPP" ? `https://wa.me/${recipient.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}` : null;
  return NextResponse.json({ message: `${channel === "EMAIL" ? "Email" : "WhatsApp"} reminder recorded.`, whatsappUrl });
}
