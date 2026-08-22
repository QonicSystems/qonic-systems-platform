import { utcDay } from "@/lib/delivery/timesheet";

/**
 * The payout ledger's business rules, kept pure and Prisma-free — same
 * reasoning as lib/delivery/timesheet.ts and lib/contracts/workflow.ts: a
 * rule that touches money is worth testing directly, without mocking a
 * database round trip for every case.
 *
 * The daily rate is derived from the person's employment contract — the
 * monthlyCompensation field on their latest RELEASED/ACKNOWLEDGED contract
 * letter (see lib/contracts/payload.ts) — divided by the actual weekdays in
 * that specific day's calendar month. This is deliberately per-PERSON, not
 * per-project: what someone is paid on a given day doesn't depend on which
 * client project they logged it against. ProjectAssignment.rate remains a
 * separate, unrelated figure — the client's hourly charge-out rate.
 */

export type PayoutCategory = "ACTUAL_PAYOUT" | "BILLED_TO_COMPANY";

export type AssignmentStartInfo = {
  projectId: string;
  /** `ProjectAssignment.startedOn ?? ProjectAssignment.createdAt` — when this resource's own assignment to this project began. Never `Project.startDate`: that's the project's own date, not this person's, and would misclassify every backfilled day as actual payout. */
  assignmentStartedAt: Date;
};

export type BillableDayEntry = { projectId: string; workDate: Date; billable: boolean };

export type PayoutLedgerLine = {
  projectId: string;
  workDate: Date;
  amount: number;
  category: PayoutCategory;
};

/** Weekdays (Mon–Fri) in the UTC calendar month that `day` falls in. */
export function workingDaysInMonth(day: Date): number {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  let count = 0;
  for (let date = 1; date <= daysInMonth; date++) {
    const weekday = new Date(Date.UTC(year, month, date)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/**
 * Daily rate = monthly compensation ÷ the actual weekday count of the
 * calendar month `day` falls in — not a fixed divisor, so a 23-weekday month
 * and a 20-weekday month pay a genuinely different daily figure, matching
 * the real calendar rather than an assumed constant.
 */
export function dailyRateFor(monthlyCompensation: number | null, day: Date): number {
  if (!monthlyCompensation) return 0;
  const days = workingDaysInMonth(day);
  return days === 0 ? 0 : Math.round(monthlyCompensation / days);
}

/**
 * ACTUAL_PAYOUT from the day this resource's own assignment began onward;
 * BILLED_TO_COMPANY for any earlier day — which can only be reached at all
 * because the timesheet bookability window (isDayBookable in
 * lib/delivery/timesheet.ts) already refuses anything before the project's
 * own start date, so "earlier than my assignment" here always still means
 * "on or after the project started."
 */
export function payoutCategoryFor(workDate: Date, assignmentStartedAt: Date): PayoutCategory {
  return utcDay(workDate) >= utcDay(assignmentStartedAt) ? "ACTUAL_PAYOUT" : "BILLED_TO_COMPANY";
}

/**
 * Groups a timesheet's entries into one payout-ledger line per (project, day)
 * that had at least one billable entry.
 *
 * Billability here is day-based, not hourly: the core rule is "was this an
 * active billing day," not "how many hours were logged" — a day with any
 * billable time counts as one full day at that day's flat rate, never
 * prorated. A day with only non-billable time generates no line at all.
 */
export function payoutLinesFor(
  entries: ReadonlyArray<BillableDayEntry>,
  assignments: ReadonlyArray<AssignmentStartInfo>,
  monthlyCompensation: number | null,
): PayoutLedgerLine[] {
  const byProject = new Map(assignments.map((assignment) => [assignment.projectId, assignment]));
  const seen = new Set<string>();
  const lines: PayoutLedgerLine[] = [];

  for (const entry of entries) {
    if (!entry.billable) continue;
    const assignment = byProject.get(entry.projectId);
    if (!assignment) continue; // No assignment on record for this project — nothing to pay out against.

    const key = `${entry.projectId}:${entry.workDate.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push({
      projectId: entry.projectId,
      workDate: entry.workDate,
      amount: dailyRateFor(monthlyCompensation, entry.workDate),
      category: payoutCategoryFor(entry.workDate, assignment.assignmentStartedAt),
    });
  }

  return lines;
}
