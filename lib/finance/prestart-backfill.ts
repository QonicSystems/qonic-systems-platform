/**
 * Finds unrecorded working days in the gap between a project's start and a
 * resource's own Actual Start Date. These are the only days that could become
 * BILLED_TO_COMPANY after genuine time is entered and approved.
 *
 * This intentionally does not assign hours or money. A missing timesheet is a
 * prompt to capture real delivery, not evidence that an eight-hour day worked.
 */
export function missingPreStartWorkdays({
  projectStart,
  actualStart,
  today,
  recordedDays,
}: {
  projectStart: Date | null;
  actualStart: Date;
  today: Date;
  recordedDays: ReadonlySet<string>;
}): Date[] {
  if (!projectStart) return [];

  const first = utcDate(projectStart);
  const last = utcDate(actualStart);
  last.setUTCDate(last.getUTCDate() - 1);
  const latestAllowed = utcDate(today);
  if (last > latestAllowed) last.setTime(latestAllowed.getTime());
  if (first > last) return [];

  const missing: Date[] = [];
  for (const day = new Date(first); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (!recordedDays.has(isoDay(day))) missing.push(new Date(day));
  }
  return missing;
}

export function isoDay(value: Date): string {
  return utcDate(value).toISOString().slice(0, 10);
}

function utcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
