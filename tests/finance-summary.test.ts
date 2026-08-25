import { describe, expect, it } from "vitest";
import { currencyKeys, formatCurrencyTotals, subtractCurrencyTotals, totalsByCurrency } from "@/lib/finance/summary";

describe("company finance currency summaries", () => {
  it("groups like currencies without converting or mixing them", () => {
    expect(totalsByCurrency([
      { currency: "INR", amount: 120_000 },
      { currency: "USD", amount: 50_00 },
      { currency: "INR", amount: 30_000 },
    ])).toEqual({ INR: 150_000, USD: 50_00 });
  });

  it("calculates a cash position currency by currency", () => {
    const received = totalsByCurrency([{ currency: "INR", amount: 100_000 }, { currency: "USD", amount: 80_00 }]);
    const expenses = totalsByCurrency([{ currency: "INR", amount: 35_000 }, { currency: "USD", amount: 20_00 }]);
    expect(subtractCurrencyTotals(received, expenses)).toEqual({ INR: 65_000, USD: 60_00 });
    expect(currencyKeys(received, expenses)).toEqual(["INR", "USD"]);
  });

  it("formats a multi-currency total without pretending it is one amount", () => {
    expect(formatCurrencyTotals({ INR: 125_050, USD: 50_00 })).toBe("INR 1,250.50 · USD 50.00");
  });
});
