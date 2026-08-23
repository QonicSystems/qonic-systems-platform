import { describe, expect, it } from "vitest";
import { nextEarningInvoiceSequence, remainingEarningAmount } from "@/lib/finance/earnings";

describe("earning invoice balances", () => {
  it("keeps a Developer's later approved delivery as a supplemental invoice balance", () => {
    const earlyInvoice = { amount: 64_000, status: "SUBMITTED", sequence: 1 };
    // The closed-month ledger has grown from ₹640 to ₹960 after the urgent
    // invoice was raised. Only the new ₹320 remains payable.
    expect(remainingEarningAmount(96_000, [earlyInvoice])).toBe(32_000);
    expect(nextEarningInvoiceSequence([earlyInvoice])).toBe(2);
  });

  it("does not let rejected or void invoices consume an earning", () => {
    expect(remainingEarningAmount(100_000, [
      { amount: 100_000, status: "REJECTED" },
      { amount: 100_000, status: "VOID" },
    ])).toBe(100_000);
  });

  it("never produces a negative remaining amount", () => {
    expect(remainingEarningAmount(100_000, [{ amount: 120_000, status: "PAID" }])).toBe(0);
  });
});
