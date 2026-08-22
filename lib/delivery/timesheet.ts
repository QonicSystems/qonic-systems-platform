import type { AuthContext } from "@/lib/auth/guard";
import type { TimesheetStatus } from "@/lib/generated/prisma/enums";

/** A standard working week, used as the denominator for utilisation. */
export const STANDARD_WEEK_MINUTES = 40 * 60;
/** Nobody books more than this in one day; a larger figure is a typo. */
export const MAX_DAY_MINUTES = 16 * 60;

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay: 0 = Sunday, so Sunday belongs to the week that began six days earlier.
  const offset = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart.getTime());
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });
}

/**
 * Parses "7.5", "7:30", or "450m" into minutes.
 *
 * Time is stored as integer minutes throughout: hours as a float accumulate
 * rounding error across a month and make invoices disagree with timesheets.
 */
export function parseDuration(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;

  const colon = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  const minutes = /^(\d{1,4})m$/i.exec(text);
  if (minutes) return Number(minutes[1]);

  const hours = /^(\d{1,2})(?:[.,](\d{1,2}))?h?$/.exec(text);
  if (!hours) return null;
  const whole = Number(hours[1]);
  const fraction = hours[2] ? Number(`0.${hours[2]}`) : 0;
  return Math.round((whole + fraction) * 60);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/** Only a draft or a rejected week may be edited — approved time is immutable. */
export const EDITABLE_STATUSES: ReadonlyArray<TimesheetStatus> = ["DRAFT", "REJECTED"];

/**
 * Own timesheet: the normal case, requires `timesheet.submit`. Someone
 * else's: only an approver may enter or correct it directly, and only while
 * it's still open — this is the handover path (an offboarded resource can no
 * longer log in to backfill their own gap days, so someone with authority
 * over approvals does it instead), not a general "edit anyone's time" grant.
 */
export function canEditTimesheet(actor: AuthContext, sheet: { userId: string; status: TimesheetStatus }): boolean {
  if (!EDITABLE_STATUSES.includes(sheet.status)) return false;
  if (sheet.userId === actor.user.id) return actor.permissions.has("timesheet.submit");
  return actor.permissions.has("timesheet.approve");
}

/** Midnight UTC of the calendar day `date` falls on — strips any time-of-day component so two dates compare on the day alone. */
export function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Whether someone could legitimately have booked time on this specific
 * calendar day: on or after the day they were first assigned to *any*
 * project, and not later than today.
 *
 * Day-level, not week-level — the week containing either boundary (the week
 * someone joined, or the current week) is a mix of bookable and locked days,
 * not all-or-nothing. Before the earliest assignment there is nothing to
 * log — the API already refuses time entries against a project you aren't
 * assigned to. After today would be claiming work that has not happened yet.
 * `null` means no assignment has ever existed, so no day is bookable.
 */
export function isDayBookable(day: Date, today: Date, earliestAssignmentAt: Date | null): boolean {
  if (!earliestAssignmentAt) return false;
  const value = utcDay(day);
  return value >= utcDay(earliestAssignmentAt) && value <= utcDay(today);
}

export type TimesheetFacts = { userId: string; status: TimesheetStatus };

/**
 * Who may approve or reject a submitted week.
 *
 * Nobody approves their own timesheet, whatever they hold — the same
 * segregation-of-duties rule used for contract letters and leave. Time drives
 * invoicing, so self-approval would let one person bill unchecked.
 */
export function canDecideTimesheet(
  actor: AuthContext,
  sheet: TimesheetFacts,
): { ok: true } | { ok: false; reason: string; status: 403 | 409 } {
  if (sheet.status !== "SUBMITTED") return { ok: false, reason: "Only a submitted timesheet can be decided.", status: 409 };
  if (sheet.userId === actor.user.id) return { ok: false, reason: "You cannot approve your own timesheet.", status: 403 };
  if (!actor.permissions.has("timesheet.approve")) return { ok: false, reason: "You do not have permission to approve timesheets.", status: 403 };
  return { ok: true };
}

/**
 * Whether the owner may pull a submitted week back to draft.
 *
 * Submitting used to be one-way: EDITABLE_STATUSES is DRAFT and REJECTED, so a
 * week sent in with a typo could only be fixed by an approver rejecting it,
 * which put a spurious rejection on the record. Recall is allowed only while the
 * week is still SUBMITTED — once it is APPROVED the time is immutable, and the
 * approver's rejection is the correct route back.
 */
export function canRecallTimesheet(
  actor: AuthContext,
  sheet: TimesheetFacts,
): { ok: true } | { ok: false; reason: string; status: 403 | 409 } {
  if (sheet.userId !== actor.user.id) return { ok: false, reason: "You can only recall your own timesheet.", status: 403 };
  if (!actor.permissions.has("timesheet.submit")) return { ok: false, reason: "You do not have permission to record time.", status: 403 };
  if (sheet.status === "APPROVED") return { ok: false, reason: "That week has been approved and can no longer be changed. Ask an approver to reject it if it is wrong.", status: 409 };
  if (sheet.status !== "SUBMITTED") return { ok: false, reason: "Only a submitted week can be recalled.", status: 409 };
  return { ok: true };
}

export function canSubmitTimesheet(
  actor: AuthContext,
  sheet: TimesheetFacts,
  totalMinutes: number,
): { ok: true } | { ok: false; reason: string; status: 403 | 409 } {
  if (sheet.userId !== actor.user.id) return { ok: false, reason: "You can only submit your own timesheet.", status: 403 };
  if (!EDITABLE_STATUSES.includes(sheet.status)) return { ok: false, reason: "That week has already been submitted.", status: 409 };
  if (totalMinutes <= 0) return { ok: false, reason: "Add some time before submitting the week.", status: 409 };
  return { ok: true };
}

export type UtilisationInput = { billableMinutes: number; nonBillableMinutes: number; capacityMinutes?: number };

/**
 * Billable share of recorded time, and of contracted capacity.
 *
 * `billableRatio` answers "of the time booked, how much is chargeable" and
 * `utilisation` answers "of a standard week, how much was chargeable" — they
 * differ whenever someone books more or less than a full week, which is exactly
 * when the distinction matters.
 */
export function utilisation({ billableMinutes, nonBillableMinutes, capacityMinutes = STANDARD_WEEK_MINUTES }: UtilisationInput) {
  const total = billableMinutes + nonBillableMinutes;
  return {
    totalMinutes: total,
    billableMinutes,
    nonBillableMinutes,
    billableRatio: total === 0 ? 0 : billableMinutes / total,
    utilisation: capacityMinutes === 0 ? 0 : billableMinutes / capacityMinutes,
  };
}
