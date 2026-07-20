import type { AuthContext } from "@/lib/auth/guard";

export type LeaveErrors = Partial<Record<"leaveTypeId" | "startDate" | "endDate" | "reason", string>>;

export type LeaveInput = { leaveTypeId: string; startDate: string; endDate: string; reason: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date — `Date.parse` accepts 2026-02-31 and rolls it over. */
export function parseDate(value: string): Date | null {
  const match = DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

/**
 * Counts working days inclusive of both ends, skipping weekends.
 *
 * Public holidays are not modelled yet, so a holiday inside a range still counts
 * as leave. That is a deliberate simplification, not an oversight — see ROADMAP.
 */
export function workingDaysBetween(start: Date, end: Date): number {
  let days = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function validateLeaveInput(value: unknown): { data?: LeaveInput & { start: Date; end: Date; days: number }; errors: LeaveErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: LeaveInput = {
    leaveTypeId: String(input.leaveTypeId ?? "").trim(),
    startDate: String(input.startDate ?? "").trim(),
    endDate: String(input.endDate ?? "").trim(),
    reason: String(input.reason ?? "").trim().slice(0, 1000),
  };
  const errors: LeaveErrors = {};

  if (!data.leaveTypeId) errors.leaveTypeId = "Please choose a leave type.";
  const start = parseDate(data.startDate);
  const end = parseDate(data.endDate);
  if (!start) errors.startDate = "Please enter a valid start date.";
  if (!end) errors.endDate = "Please enter a valid end date.";
  if (start && end && end < start) errors.endDate = "The end date cannot be before the start date.";

  if (Object.keys(errors).length || !start || !end) return { errors };

  const days = workingDaysBetween(start, end);
  // A range that lands entirely on a weekend costs nothing and is almost
  // certainly a mistake, so it is rejected rather than silently recorded as 0.
  if (days === 0) return { errors: { startDate: "That range contains no working days." } };

  return { data: { ...data, start, end, days }, errors };
}

export type DecidableRequest = { userId: string; status: string };

/**
 * Who may decide a request.
 *
 * `leave.manage` covers anyone; `leave.approve` covers only the requester's
 * direct reports. Nobody approves their own leave, whatever they hold — the
 * same segregation-of-duties rule the contract workflow uses.
 */
export function canDecideLeave(
  actor: AuthContext,
  request: DecidableRequest,
  requesterManagerId: string | null,
): { ok: true } | { ok: false; reason: string; status: 403 | 409 } {
  if (request.status !== "PENDING") return { ok: false, reason: "That request has already been decided.", status: 409 };
  if (request.userId === actor.user.id) return { ok: false, reason: "You cannot decide your own leave request.", status: 403 };

  if (actor.permissions.has("leave.manage")) return { ok: true };
  if (actor.permissions.has("leave.approve") && requesterManagerId === actor.user.id) return { ok: true };

  return { ok: false, reason: "You can only decide leave for people who report to you.", status: 403 };
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
