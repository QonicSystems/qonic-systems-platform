import { formatMoney } from "@/lib/money";

export type CurrencyAmount = { currency: string; amount: number };
export type CurrencyTotals = Readonly<Record<string, number>>;

/** Groups minor-unit amounts without ever adding unrelated currencies together. */
export function totalsByCurrency(rows: ReadonlyArray<CurrencyAmount>): CurrencyTotals {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = row.currency.trim().toUpperCase() || "INR";
    totals[currency] = (totals[currency] ?? 0) + row.amount;
  }
  return totals;
}

export function subtractCurrencyTotals(income: CurrencyTotals, ...costs: CurrencyTotals[]): CurrencyTotals {
  const result: Record<string, number> = { ...income };
  for (const cost of costs) {
    for (const [currency, amount] of Object.entries(cost)) result[currency] = (result[currency] ?? 0) - amount;
  }
  return result;
}

export function currencyKeys(...totals: CurrencyTotals[]): string[] {
  return [...new Set(totals.flatMap((total) => Object.keys(total)))].sort();
}

export function formatCurrencyTotals(totals: CurrencyTotals, empty = "—"): string {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") : empty;
}
