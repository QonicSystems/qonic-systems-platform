/**
 * Foreign-currency invoices are contractual documents: their amount and
 * currency never change after issue. When a vendor settles one in INR, this
 * module converts the applied invoice amount at the rate frozen on the
 * invoice, then isolates the bank difference as realised FX gain or loss.
 *
 * All monetary inputs and outputs are minor units. For INR/USD, multiplying
 * USD cents by INR-per-USD gives INR paise directly, which keeps the result
 * integer and avoids currency floating-point arithmetic.
 */

const FX_RATE = /^\d+(?:\.\d{1,6})?$/;

export function parseSettlementRate(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!FX_RATE.test(text)) return null;
  const rate = Number(text);
  return Number.isFinite(rate) && rate > 0 && rate <= 1_000_000 ? rate : null;
}

/** Expected INR paise for a foreign-currency invoice amount at its locked rate. */
export function settlementAmountAtLockedRate(invoiceAmount: number, lockedRate: number): number {
  return Math.round(invoiceAmount * lockedRate);
}

/** Positive means Qonic received more INR than the locked invoice-rate value. */
export function realizedFxDifference(invoiceAmount: number, receivedSettlementAmount: number, lockedRate: number): number {
  return receivedSettlementAmount - settlementAmountAtLockedRate(invoiceAmount, lockedRate);
}

export function formatSettlementRate(rate: number, settlementCurrency: string, invoiceCurrency: string): string {
  return `${rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${settlementCurrency} per ${invoiceCurrency}`;
}
