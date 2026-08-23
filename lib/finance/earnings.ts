import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { monthlySalaryValues, monthRange } from "@/lib/finance/compensation";

export type ExpectedEarning = {
  currency: string;
  amount: number;
  source: "DELIVERY_PAYOUT" | "MONTHLY_SALARY";
  calculation: Prisma.InputJsonObject;
};

type RaisedEarning = { amount: number; status: string };

/** Rejected and voided claims never reduce a person's still-invoiceable amount. */
export function countsTowardEarning(earning: RaisedEarning): boolean {
  return !["REJECTED", "VOID"].includes(earning.status);
}

/**
 * Returns the amount still available to claim for a period and currency.
 * This is what makes an urgent Developer invoice safe: a later closed-month
 * invoice contains only delivery approved after the early invoice.
 */
export function remainingEarningAmount(expectedAmount: number, raised: ReadonlyArray<RaisedEarning>): number {
  return Math.max(0, expectedAmount - raised.filter(countsTowardEarning).reduce((total, invoice) => total + invoice.amount, 0));
}

export function nextEarningInvoiceSequence(raised: ReadonlyArray<{ sequence: number }>): number {
  return raised.reduce((highest, invoice) => Math.max(highest, invoice.sequence), 0) + 1;
}

/** Server-calculated only — the browser never supplies an earning amount. */
export async function expectedEarningsForUser(userId: string, viaCandidatePool: boolean, month: string): Promise<ExpectedEarning[]> {
  const range = monthRange(month);
  if (!range) return [];

  if (viaCandidatePool) {
    const groups = await db.payoutLedgerEntry.groupBy({
      by: ["currency"],
      where: { userId, category: "ACTUAL_PAYOUT", workDate: { gte: range.start, lte: range.end } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return groups
      .map((group) => ({
        currency: group.currency,
        amount: group._sum.amount ?? 0,
        source: "DELIVERY_PAYOUT" as const,
        calculation: { kind: "delivery_payout", month, approvedLedgerEntries: group._count._all, amount: group._sum.amount ?? 0 },
      }))
      .filter((earning) => earning.amount > 0)
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  const profiles = await db.compensationProfile.findMany({
    where: {
      userId,
      effectiveFrom: { lte: range.end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.start } }],
    },
    select: { id: true, monthlyAmount: true, currency: true, effectiveFrom: true, effectiveTo: true },
    orderBy: { effectiveFrom: "asc" },
  });
  return monthlySalaryValues(profiles, month).map((earning) => ({
    currency: earning.currency,
    amount: earning.amount,
    source: "MONTHLY_SALARY" as const,
    calculation: earning.calculation,
  }));
}
