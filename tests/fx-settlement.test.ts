import { describe, expect, it } from "vitest";
import { parseSettlementRate, realizedFxDifference, settlementAmountAtLockedRate } from "@/lib/finance/fx-settlement";

describe("foreign-currency invoice settlement", () => {
  it("keeps the locked-rate value and a higher INR bank receipt separate", () => {
    // USD 1,000.00 × INR 95 = INR 95,000.00 expected at invoice issue.
    expect(settlementAmountAtLockedRate(100_000, 95)).toBe(9_500_000);
    // The vendor instead transfers INR 110,000.00; this is a realised gain,
    // not a change to the USD invoice.
    expect(realizedFxDifference(100_000, 11_000_000, 95)).toBe(1_500_000);
  });

  it("records a lower INR bank receipt as a realised loss", () => {
    expect(realizedFxDifference(100_000, 9_300_000, 95)).toBe(-200_000);
  });

  it("accepts only a positive rate with at most six decimal places", () => {
    expect(parseSettlementRate("95.125")).toBe(95.125);
    expect(parseSettlementRate("0")).toBeNull();
    expect(parseSettlementRate("95.1234567")).toBeNull();
    expect(parseSettlementRate("INR 95")).toBeNull();
  });
});
