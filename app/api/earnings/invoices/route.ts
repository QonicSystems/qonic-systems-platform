import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { leadershipRoleWhere } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { expectedEarningsForUser, nextEarningInvoiceSequence, remainingEarningAmount } from "@/lib/finance/earnings";
import { monthRange } from "@/lib/finance/compensation";
import { renderEarningInvoicePdf } from "@/lib/finance/earning-invoice-pdf";
import { formatMoney } from "@/lib/money";
import { notifyLeadership, sendEmail } from "@/lib/notify";
import { nextReferenceFrom, referenceWhere } from "@/lib/reference";

export const runtime = "nodejs";

async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await db.earningInvoice.findMany({
    where: { OR: referenceWhere("reference", "EI", year) },
    select: { reference: true },
  });
  return nextReferenceFrom(existing.map((invoice) => invoice.reference), "EI", year);
}

/** A signed-in Qonic person raises their own server-calculated monthly invoice. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid earnings invoice." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const month = String(input.month ?? "").trim();
  const currency = String(input.currency ?? "").trim().toUpperCase();
  const notes = String(input.notes ?? "").trim().slice(0, 1_000);
  const range = monthRange(month);
  if (!range || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ message: "Choose a valid earning month and currency." }, { status: 422 });
  }
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthIsClosed = range.end < currentMonthStart;

  const user = await db.user.findUnique({ where: { id: context.user.id }, include: { role: true } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ message: "Your account is no longer active." }, { status: 409 });
  const expected = (await expectedEarningsForUser(user.id, user.role.viaCandidatePool, month)).find((value) => value.currency === currency);
  if (!expected) {
    return NextResponse.json({ message: "There is no invoiceable earning for that month and currency. Amounts are calculated from approved delivery or the salary schedule." }, { status: 409 });
  }
  const raised = await db.earningInvoice.findMany({
    where: { userId: user.id, period: range.start, currency },
    select: { id: true, amount: true, status: true, sequence: true },
    orderBy: { sequence: "asc" },
  });
  const remainingAmount = remainingEarningAmount(expected.amount, raised);
  if (remainingAmount <= 0) return NextResponse.json({ message: "The calculated earning for this period is already fully covered by your existing invoice." }, { status: 409 });

  let earlyRelease: { id: string; usedAt: Date | null } | null = null;
  if (!monthIsClosed) {
    // Early access is intentionally limited to the current open month and to
    // the one person/currency explicitly authorised by a founder.
    if (range.start.getTime() !== currentMonthStart.getTime()) {
      return NextResponse.json({ message: "This earning month is still open. A founder may authorise an urgent invoice only for the current month." }, { status: 409 });
    }
    earlyRelease = await db.earningInvoiceEarlyRelease.findUnique({
      where: { userId_period_currency: { userId: user.id, period: range.start, currency } },
      select: { id: true, usedAt: true },
    });
    if (!earlyRelease || earlyRelease.usedAt) {
      return NextResponse.json({ message: "This earning month is still open. Raise its invoice after month close, or ask the CEO or Co-Founder to authorise one urgent early invoice." }, { status: 409 });
    }
  }

  const sequence = nextEarningInvoiceSequence(raised);
  let invoice;
  try {
    invoice = await db.$transaction(async (tx) => {
      if (earlyRelease) {
        // A conditional update makes the early approval single-use even if two
        // browser tabs submit at nearly the same time.
        const used = await tx.earningInvoiceEarlyRelease.updateMany({
          where: { id: earlyRelease.id, usedAt: null },
          data: { usedAt: now },
        });
        if (used.count !== 1) return null;
      }
      const created = await tx.earningInvoice.create({
        data: {
          reference: await nextReference(),
          userId: user.id,
          period: range.start,
          currency,
          amount: remainingAmount,
          source: expected.source,
          calculation: {
            ...expected.calculation,
            invoiceAmount: remainingAmount,
            previouslyInvoicedAmount: expected.amount - remainingAmount,
            sequence,
          },
          notes: notes || null,
          sequence,
          earlyReleaseId: earlyRelease?.id,
        },
      });
      await notifyLeadership({
        kind: "INVOICE",
        title: `Earnings invoice submitted: ${created.reference}`,
        body: `${user.name} submitted ${formatMoney(created.amount, created.currency)} for ${month}.`,
        link: "/reports/revenue",
      }, tx);
      await recordAudit({
        actorId: user.id,
        action: "earning_invoice.submit",
        entityType: "EarningInvoice",
        entityId: created.id,
        after: { reference: created.reference, period: month, currency, amount: created.amount, source: created.source, sequence: created.sequence, earlyReleaseId: earlyRelease?.id ?? null },
        ipAddress: clientIp(request),
      }, tx);
      return created;
    });
  } catch (error) {
    // A second request may calculate the same sequence before the first one
    // commits. Preserve the invoice invariant and return an actionable result.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "An invoice for this earning was just raised in another request. Refresh My Earnings." }, { status: 409 });
    }
    throw error;
  }
  if (!invoice) return NextResponse.json({ message: "That early-release approval was already used. Refresh My Earnings to see the invoice that was raised." }, { status: 409 });

  // Finance receives the same formal document that the payee sees. This is
  // separate from the in-app notification, whose email is intentionally terse.
  try {
    const [pdf, leaders] = await Promise.all([
      renderEarningInvoicePdf({
        reference: invoice.reference, payeeName: user.name, payeeEmail: user.email,
        period: invoice.period, submittedAt: invoice.submittedAt, currency: invoice.currency,
        amount: invoice.amount, source: invoice.source, status: invoice.status, notes: invoice.notes,
      }),
      db.user.findMany({ where: { status: "ACTIVE", role: leadershipRoleWhere }, select: { email: true } }),
    ]);
    await sendEmail(
      leaders.map((leader) => leader.email),
      `Earnings invoice submitted: ${invoice.reference}`,
      `${user.name} submitted ${invoice.reference} for ${formatMoney(invoice.amount, invoice.currency)}${invoice.sequence > 1 ? " (supplemental invoice for the same month)" : ""}. The PDF is attached for approval and payment processing.`,
      "/reports/revenue",
      [{ filename: `${invoice.reference}.pdf`, content: pdf }],
    );
  } catch (error) {
    console.error(`Earnings invoice PDF email failed for ${invoice.reference}`, error);
  }

  return NextResponse.json({ message: `${invoice.reference} was submitted for ${formatMoney(invoice.amount, invoice.currency)}${invoice.sequence > 1 ? " as a supplemental invoice." : "."}`, id: invoice.id, reference: invoice.reference }, { status: 201 });
}
