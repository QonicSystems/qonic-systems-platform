import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { formatMoney, toMinor } from "@/lib/money";
import { notifyLeadership, sendEmail } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Record a payment received. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("payment.record");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { client: { include: { vendor: true, globalCandidate: true } } },
  });
  if (!invoice) return NextResponse.json({ message: "That invoice could not be found." }, { status: 404 });
  if (invoice.status === "DRAFT") return NextResponse.json({ message: "Issue the invoice before recording a payment." }, { status: 409 });
  if (invoice.status === "VOID") return NextResponse.json({ message: "That invoice is void." }, { status: 409 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const amount = toMinor(String(input.amount ?? ""));
  const paidOn = String(input.paidOn ?? "").trim();
  if (amount === null || Number.isNaN(amount) || amount <= 0) return NextResponse.json({ message: "Enter the amount received." }, { status: 422 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return NextResponse.json({ message: "Enter the date it was received." }, { status: 422 });

  const outstanding = invoice.total - invoice.paidAmount;
  if (amount > outstanding) {
    return NextResponse.json({
      message: `That is more than the ${formatMoney(outstanding, invoice.currency)} outstanding on this invoice.`,
    }, { status: 422 });
  }

  const paidAmount = invoice.paidAmount + amount;

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: id, amount, paidOn: new Date(`${paidOn}T00:00:00.000Z`),
        method: String(input.method ?? "Bank transfer").trim() || "Bank transfer",
        reference: String(input.reference ?? "").trim() || null,
        recordedById: context.user.id,
      },
    });
    // The running total and status move with the payment, in one transaction,
    // so the invoice can never disagree with its own payments.
    await tx.invoice.update({
      where: { id },
      data: { paidAmount, status: paidAmount >= invoice.total ? "PAID" : "PART_PAID" },
    });
    await notifyLeadership({
      kind: "INVOICE",
      title: paidAmount >= invoice.total ? `Payment received in full: ${invoice.number}` : `Partial payment received: ${invoice.number}`,
      body: `${context.user.name} recorded ${formatMoney(amount, invoice.currency)} against ${invoice.number}. ${formatMoney(invoice.total - paidAmount, invoice.currency)} remains outstanding.`,
      link: "/invoices",
    }, tx);
    await recordAudit({ actorId: context.user.id, action: "payment.record", entityType: "Invoice", entityId: id, after: { number: invoice.number, amount, paidAmount }, ipAddress: clientIp(request) }, tx);
  });

  const recipient = invoice.commercialKind === "QONIC_TO_VENDOR"
    ? invoice.client.vendor?.email
    : invoice.commercialKind === "GLOBAL_CANDIDATE_COMMISSION_RECORD"
      ? invoice.client.globalCandidate?.email
      : null;
  if (recipient) {
    void sendEmail(
      [recipient],
      `Payment confirmation — ${invoice.number}`,
      `A payment of ${formatMoney(amount, invoice.currency)} has been recorded against ${invoice.number}.`,
      "/invoices"
    );
  }

  return NextResponse.json({
    message: paidAmount >= invoice.total
      ? `${invoice.number} is now paid in full.`
      : `Payment recorded. ${formatMoney(invoice.total - paidAmount, invoice.currency)} still outstanding.`,
  });
}
