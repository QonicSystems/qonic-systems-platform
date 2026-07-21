import { describe, expect, it } from "vitest";
import { ageingBucket, formatMoney, hoursToCentihours, invoiceTotals, lineAmount, placementFee, toMinor } from "@/lib/money";

describe("toMinor", () => {
  it.each([["1250.50", 125050], ["1,250.50", 125050], ["0.10", 10], ["100", 10000], ["0.01", 1]])(
    "converts %s to %i minor units", (input, expected) => {
      expect(toMinor(input)).toBe(expected);
    });

  it("returns null for a blank value rather than zero", () => {
    // Blank means "not supplied"; zero would be a real amount.
    expect(toMinor("")).toBeNull();
    expect(toMinor("   ")).toBeNull();
  });

  it.each(["lots", "12.345", "-5", "1e5"])("rejects %s", (input) => {
    expect(Number.isNaN(toMinor(input) as number)).toBe(true);
  });

  it("avoids binary floating-point drift", () => {
    // 19.99 * 100 is 1998.9999999999998 before rounding.
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("0.29")).toBe(29);
    expect(toMinor("1.005")).toBeNaN(); // three decimals are not money
  });
});

describe("lineAmount", () => {
  it("multiplies hundredths of a unit by a minor-unit rate", () => {
    // 7.5 hours at 3500.00 = 26250.00
    expect(lineAmount(750, 350000)).toBe(2625000);
  });

  it("rounds once, at the end", () => {
    // 0.33h at 1000.00 = 330.00 exactly, not 329.999…
    expect(lineAmount(33, 100000)).toBe(33000);
  });

  it("handles a zero rate without producing NaN", () => {
    expect(lineAmount(750, 0)).toBe(0);
  });
});

describe("hoursToCentihours", () => {
  it.each([[450, 750], [480, 800], [60, 100], [90, 150]])(
    "converts %i minutes to %i hundredths of an hour", (minutes, expected) => {
      expect(hoursToCentihours(minutes)).toBe(expected);
    });
});

describe("invoiceTotals", () => {
  const lines = [{ amount: 100000 }, { amount: 50000 }];

  it("sums the lines and applies tax", () => {
    expect(invoiceTotals(lines, 18)).toEqual({ subtotal: 150000, taxAmount: 27000, total: 177000 });
  });

  it("handles zero tax", () => {
    expect(invoiceTotals(lines, 0)).toEqual({ subtotal: 150000, taxAmount: 0, total: 150000 });
  });

  it("keeps the total exactly equal to subtotal plus tax", () => {
    // A rounding mismatch here is what makes an invoice fail to foot.
    const result = invoiceTotals([{ amount: 33333 }, { amount: 66667 }], 7.5);
    expect(result.total).toBe(result.subtotal + result.taxAmount);
  });

  it("returns zero for an empty invoice", () => {
    expect(invoiceTotals([], 18)).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
});

describe("placementFee", () => {
  it("takes a percentage of salary", () => {
    // 1,800,000.00 at 12.5% = 225,000.00
    expect(placementFee(180000000, 12.5)).toBe(22500000);
  });

  it("rounds to the minor unit", () => {
    expect(placementFee(100001, 33.333)).toBe(Math.round((100001 * 33.333) / 100));
  });
});

describe("ageingBucket", () => {
  const due = new Date("2026-07-01T00:00:00.000Z");
  const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it.each([
    ["2026-06-20", "current"],
    ["2026-07-01", "current"],
    ["2026-07-15", "1-30"],
    ["2026-07-31", "1-30"],
    ["2026-08-15", "31-60"],
    ["2026-09-15", "61-90"],
    ["2026-11-01", "90+"],
  ])("puts an invoice due 1 July, seen on %s, in %s", (asOf, expected) => {
    expect(ageingBucket(due, on(asOf))).toBe(expected);
  });
});

describe("formatMoney", () => {
  it("always shows two decimals, treating the input as MINOR units", () => {
    expect(formatMoney(125050, "INR")).toContain("1,250.50");
    // 10000 minor units is 100.00 — not 10,000.
    expect(formatMoney(10000, "USD")).toBe("USD 100.00");
    expect(formatMoney(1000000, "USD")).toBe("USD 10,000.00");
  });

  it("shows a dash for a missing amount", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});
