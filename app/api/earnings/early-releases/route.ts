import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { expectedEarningsForUser, remainingEarningAmount } from "@/lib/finance/earnings";
import { monthRange } from "@/lib/finance/compensation";
import { formatMoney } from "@/lib/money";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";

function isFounderFinance(context: { role: { key: string; isSuperAdmin: boolean } }) {
  return context.role.isSuperAdmin || context.role.key === ROLE.CO_FOUNDER;
}

/**
 * Grants one urgent, current-month invoice exception. It is purposefully
 * person- and currency-specific so an emergency never opens payroll globally.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("compensation.manage");
  if (response) return response;
  if (!isFounderFinance(context)) {
    return NextResponse.json({ message: "Only the CEO or Co-Founder may enable an urgent early earnings invoice." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid early-release decision." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const userId = String(input.userId ?? "").trim();
  const month = String(input.month ?? "").trim();
  const currency = String(input.currency ?? "").trim().toUpperCase();
  const reason = String(input.reason ?? "").trim().slice(0, 1_000);
  const range = monthRange(month);
  if (!userId || !range || !/^[A-Z]{3}$/.test(currency) || reason.length < 8) {
    return NextResponse.json({ message: "Choose a person, current month, currency, and an urgency reason of at least 8 characters." }, { status: 422 });
  }

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (range.start.getTime() !== currentMonthStart.getTime()) {
    return NextResponse.json({ message: "An urgent early-release can be enabled only for the current open month. Closed months are already available normally." }, { status: 409 });
  }

  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) return NextResponse.json({ message: "That person could not be found." }, { status: 404 });
  if (target.status !== "ACTIVE") return NextResponse.json({ message: "An urgent invoice can only be enabled for an active account." }, { status: 409 });
  if (target.id !== context.user.id) {
    const authority = canAdminister(context, target);
    if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });
  }

  const expected = (await expectedEarningsForUser(target.id, target.role.viaCandidatePool, month)).find((earning) => earning.currency === currency);
  if (!expected) {
    return NextResponse.json({ message: "This person has no currently invoiceable earning in that currency. Developers need approved payout entries; People need an active salary schedule." }, { status: 409 });
  }
  const raised = await db.earningInvoice.findMany({
    where: { userId: target.id, period: range.start, currency },
    select: { amount: true, status: true },
  });
  if (remainingEarningAmount(expected.amount, raised) <= 0) {
    return NextResponse.json({ message: "The currently calculated earning is already fully covered by an existing invoice." }, { status: 409 });
  }

  const existing = await db.earningInvoiceEarlyRelease.findUnique({
    where: { userId_period_currency: { userId: target.id, period: range.start, currency } },
    include: { grantedBy: { select: { name: true } } },
  });
  if (existing) {
    return NextResponse.json({
      message: existing.usedAt
        ? `The early-release approved by ${existing.grantedBy.name} has already been used.`
        : `An urgent early-release is already enabled by ${existing.grantedBy.name}.`,
    }, { status: 409 });
  }

  let release;
  try {
    release = await db.$transaction(async (tx) => {
      const created = await tx.earningInvoiceEarlyRelease.create({
        data: { userId: target.id, period: range.start, currency, reason, grantedById: context.user.id },
      });
      await notify({
        userId: target.id,
        kind: "INVOICE",
        title: "Urgent earnings invoice enabled",
        body: `${context.user.name} enabled an urgent ${currency} invoice for ${month}. You can raise it now from My Earnings. Reason: ${reason}`,
        link: `/earnings?month=${month}`,
      }, tx);
      await recordAudit({
        actorId: context.user.id,
        action: "earning_invoice.early_release.enable",
        entityType: "EarningInvoiceEarlyRelease",
        entityId: created.id,
        after: { userId: target.id, period: month, currency, amountAvailable: expected.amount, reason },
        ipAddress: clientIp(request),
      }, tx);
      return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "An urgent invoice release was just enabled by another founder. Refresh this page." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    message: `Urgent invoice access is enabled for ${target.name}: ${formatMoney(expected.amount, currency)} for ${month}.`,
    id: release.id,
  }, { status: 201 });
}
