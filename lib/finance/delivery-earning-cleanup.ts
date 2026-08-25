/**
 * A Developer earnings invoice is derived solely from approved payout-ledger
 * days for that person, currency, and calendar month. If a hard client delete
 * removes every such day, retaining the derived invoice would leave a false
 * developer payment in Company Finance.
 */

type DeliveryEarning = { id: string; userId: string; currency: string; period: Date };
type DeliveryPayout = { userId: string; currency: string; workDate: Date };

const monthKey = (userId: string, currency: string, value: Date) =>
  `${userId}:${currency}:${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

export function orphanedDeliveryEarningInvoiceIds(
  invoices: ReadonlyArray<DeliveryEarning>,
  payoutEntries: ReadonlyArray<DeliveryPayout>,
): string[] {
  const backedMonths = new Set(payoutEntries.map((entry) => monthKey(entry.userId, entry.currency, entry.workDate)));
  return invoices
    .filter((invoice) => !backedMonths.has(monthKey(invoice.userId, invoice.currency, invoice.period)))
    .map((invoice) => invoice.id);
}
