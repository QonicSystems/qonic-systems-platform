import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { renderEarningInvoicePdf } from "@/lib/finance/earning-invoice-pdf";
import { formatMoney } from "@/lib/money";
import { notify, sendEmail } from "@/lib/notify";

export const runtime = "nodejs";

function isFounderFinance(context: { role: { key: string; isSuperAdmin: boolean } }) {
  return context.role.isSuperAdmin || context.role.key === ROLE.CO_FOUNDER;
}

/** CEO or Co-Founder decides the payable invoice; the payee can never decide their own. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("compensation.manage");
  if (response) return response;
  if (!isFounderFinance(context)) return NextResponse.json({ message: "Only the CEO or Co-Founder may decide earnings invoices." }, { status: 403 });

  const { id } = await params;
  const invoice = await db.earningInvoice.findUnique({ where: { id }, include: { user: { include: { role: true } } } });
  if (!invoice) return NextResponse.json({ message: "That earnings invoice could not be found." }, { status: 404 });
  if (invoice.userId === context.user.id) return NextResponse.json({ message: "You cannot approve, reject, or pay your own earnings invoice." }, { status: 409 });
  const authority = canAdminister(context, invoice.user);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid decision." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const action = String(input.action ?? "").trim();
  const note = String(input.note ?? "").trim().slice(0, 1_000);
  const paymentReference = String(input.paymentReference ?? "").trim().slice(0, 200);
  const transition = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : action === "pay" ? "PAID" : null;
  if (!transition) return NextResponse.json({ message: "That is not a valid earnings-invoice action." }, { status: 400 });
  if ((action === "approve" || action === "reject") && invoice.status !== "SUBMITTED") {
    return NextResponse.json({ message: "Only a submitted earnings invoice can be approved or rejected." }, { status: 409 });
  }
  if (action === "pay" && invoice.status !== "APPROVED") {
    return NextResponse.json({ message: "Only an approved earnings invoice can be marked paid." }, { status: 409 });
  }

  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const changed = await tx.earningInvoice.update({
      where: { id },
      data: {
        status: transition,
        ...(action === "pay"
          ? { paidAt: now, paidById: context.user.id, paymentReference: paymentReference || null }
          : { decidedAt: now, decidedById: context.user.id, decisionNote: note || null }),
      },
    });
    await notify({
      userId: invoice.userId,
      kind: "INVOICE",
      title: `Earnings invoice ${transition.toLowerCase()}: ${invoice.reference}`,
      body: action === "pay"
        ? `${formatMoney(invoice.amount, invoice.currency)} has been recorded as paid.${paymentReference ? ` Reference: ${paymentReference}.` : ""}`
        : note || `${invoice.reference} was ${transition.toLowerCase()}.`,
      link: "/earnings",
    }, tx);
    await recordAudit({
      actorId: context.user.id,
      action: `earning_invoice.${action}`,
      entityType: "EarningInvoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: { status: transition, note: note || null, paymentReference: paymentReference || null },
      ipAddress: clientIp(request),
    }, tx);
    return changed;
  });

  if (action === "pay") {
    try {
      const pdf = await renderEarningInvoicePdf({
        reference: updated.reference, payeeName: invoice.user.name, payeeEmail: invoice.user.email,
        period: updated.period, submittedAt: updated.submittedAt, currency: updated.currency,
        amount: updated.amount, source: updated.source, status: updated.status, notes: updated.notes,
        paidAt: updated.paidAt, paymentReference: updated.paymentReference,
      });
      await sendEmail(
        [invoice.user.email],
        `Earnings invoice paid: ${updated.reference}`,
        `${formatMoney(updated.amount, updated.currency)} has been recorded as paid. Your paid invoice PDF is attached.`,
        "/earnings",
        [{ filename: `${updated.reference}.pdf`, content: pdf }],
      );
    } catch (error) {
      console.error(`Paid earnings-invoice email failed for ${updated.reference}`, error);
    }
  }

  return NextResponse.json({ message: `${updated.reference} is ${transition.toLowerCase()}.` });
}
