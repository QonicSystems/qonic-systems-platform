/**
 * Money is stored as INTEGER MINOR UNITS (paise/cents) everywhere.
 *
 * Floating-point currency accumulates error across a month of invoice lines and
 * makes totals disagree with their own components. Every helper here takes and
 * returns integers; formatting happens only at the edge.
 */

/** Parses "1250.50" or "1,250.50" into 125050. Returns NaN when unparseable, null when blank. */
export function toMinor(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN;
  // Round after scaling: 19.99 * 100 is 1998.9999... in binary floating point.
  return Math.round(Number(text) * 100);
}

export function formatMoney(minor: number | null | undefined, currency = "INR"): string {
  if (minor === null || minor === undefined) return "—";
  return `${currency} ${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Quantities are stored as hundredths so 7.5 hours is exactly 750. */
export function hoursToCentihours(minutes: number): number {
  return Math.round((minutes / 60) * 100);
}

export function formatQuantity(centi: number): string {
  return (centi / 100).toFixed(2);
}

/**
 * A line's value, rounded once at the end.
 *
 * quantity is in hundredths and unitRate is in minor units, so the raw product
 * is 10 000× the real amount — dividing before rounding would compound error
 * across every line on the invoice.
 */
export function lineAmount(quantityCenti: number, unitRateMinor: number): number {
  return Math.round((quantityCenti * unitRateMinor) / 100);
}

export function invoiceTotals(lines: ReadonlyArray<{ amount: number }>, taxPercent: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const taxAmount = Math.round((subtotal * taxPercent) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/** Placement fee: a percentage of first-year salary, rounded to the minor unit. */
export function placementFee(salaryMinor: number, feePercent: number): number {
  return Math.round((salaryMinor * feePercent) / 100);
}

export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

/** Receivables ageing, measured from the due date. */
export function ageingBucket(dueDate: Date, asOf: Date = new Date()): AgeingBucket {
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
