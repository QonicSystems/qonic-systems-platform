import { toMinor } from "@/lib/money";

const DAY_MS = 86_400_000;

export type CompensationInput = {
  monthlyCompensation: string;
  currency: string;
  effectiveFrom: string;
  note: string;
};

export type CompensationErrors = Partial<Record<keyof CompensationInput, string>>;

export function parseCompensationInput(value: unknown): { data?: { monthlyAmount: number; currency: string; effectiveFrom: Date; note: string }; errors: CompensationErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const raw: CompensationInput = {
    monthlyCompensation: String(input.monthlyCompensation ?? "").trim(),
    currency: String(input.currency ?? "INR").trim().toUpperCase(),
    effectiveFrom: String(input.effectiveFrom ?? "").trim(),
    note: String(input.note ?? "").trim().slice(0, 1_000),
  };
  const errors: CompensationErrors = {};
  const monthlyAmount = toMinor(raw.monthlyCompensation);
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveFrom)
    ? new Date(`${raw.effectiveFrom}T00:00:00.000Z`)
    : null;
  if (monthlyAmount === null || Number.isNaN(monthlyAmount) || monthlyAmount <= 0) {
    errors.monthlyCompensation = "Enter a valid monthly amount greater than zero.";
  }
  if (!/^[A-Z]{3}$/.test(raw.currency)) errors.currency = "Use a three-letter currency code, such as INR or USD.";
  if (!effectiveDate || Number.isNaN(effectiveDate.getTime()) || effectiveDate.toISOString().slice(0, 10) !== raw.effectiveFrom) {
    errors.effectiveFrom = "Choose a valid effective date.";
  }
  if (Object.keys(errors).length > 0 || monthlyAmount === null || Number.isNaN(monthlyAmount)) return { errors };
  return {
    data: {
      monthlyAmount,
      currency: raw.currency,
      effectiveFrom: effectiveDate!,
      note: raw.note,
    },
    errors,
  };
}

export type CompensationSlice = {
  id: string;
  monthlyAmount: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type MonthlySalaryValue = {
  currency: string;
  amount: number;
  calculation: {
    kind: "monthly_salary";
    month: string;
    daysInMonth: number;
    slices: Array<{ profileId: string; monthlyAmount: number; effectiveFrom: string; effectiveTo: string; eligibleDays: number; amount: number }>;
  };
};

/** The inclusive UTC calendar-month range for `YYYY-MM`. */
export function monthRange(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0)),
  };
}

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calculates each applicable salary schedule pro-rata by calendar days.
 * It supports an explicit mid-month join, exit, or salary change without
 * rewriting previous invoices; the returned slices are stored on the invoice.
 */
export function monthlySalaryValues(profiles: ReadonlyArray<CompensationSlice>, month: string): MonthlySalaryValue[] {
  const range = monthRange(month);
  if (!range) return [];
  const daysInMonth = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1;
  const byCurrency = new Map<string, MonthlySalaryValue>();

  for (const profile of profiles) {
    const start = new Date(Math.max(profile.effectiveFrom.getTime(), range.start.getTime()));
    const end = new Date(Math.min(profile.effectiveTo?.getTime() ?? range.end.getTime(), range.end.getTime()));
    if (end < start) continue;
    const eligibleDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    const amount = Math.round((profile.monthlyAmount * eligibleDays) / daysInMonth);
    const current = byCurrency.get(profile.currency) ?? {
      currency: profile.currency,
      amount: 0,
      calculation: { kind: "monthly_salary" as const, month, daysInMonth, slices: [] },
    };
    current.amount += amount;
    current.calculation.slices.push({
      profileId: profile.id,
      monthlyAmount: profile.monthlyAmount,
      effectiveFrom: dateKey(start),
      effectiveTo: dateKey(end),
      eligibleDays,
      amount,
    });
    byCurrency.set(profile.currency, current);
  }

  return [...byCurrency.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}
