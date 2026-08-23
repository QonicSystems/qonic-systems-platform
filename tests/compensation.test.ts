import { describe, expect, it } from "vitest";
import { monthlySalaryValues, parseCompensationInput } from "@/lib/finance/compensation";

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("compensation input", () => {
  it("converts a monthly amount to minor units and rejects impossible dates", () => {
    expect(parseCompensationInput({ monthlyCompensation: "85,000.50", currency: "inr", effectiveFrom: "2026-08-01", note: "" }).data).toMatchObject({ monthlyAmount: 8_500_050, currency: "INR" });
    expect(parseCompensationInput({ monthlyCompensation: "85000", currency: "INR", effectiveFrom: "2026-02-31" }).errors.effectiveFrom).toBeTruthy();
  });
});

describe("monthlySalaryValues", () => {
  it("uses the full monthly salary for a schedule covering a full month", () => {
    const result = monthlySalaryValues([{ id: "salary-1", monthlyAmount: 310_000, currency: "INR", effectiveFrom: utc("2026-08-01"), effectiveTo: null }], "2026-08");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(310_000);
    expect(result[0].calculation.slices[0]).toMatchObject({ eligibleDays: 31, amount: 310_000 });
  });

  it("pro-rates a join or salary change by calendar days and preserves the slices", () => {
    const result = monthlySalaryValues([
      { id: "old", monthlyAmount: 310_000, currency: "INR", effectiveFrom: utc("2026-01-01"), effectiveTo: utc("2026-08-15") },
      { id: "new", monthlyAmount: 620_000, currency: "INR", effectiveFrom: utc("2026-08-16"), effectiveTo: null },
    ], "2026-08");
    // August has 31 days: 15 days at ₹3,100 + 16 at ₹6,200 in minor-unit terms.
    expect(result[0].amount).toBe(Math.round(310_000 * 15 / 31) + Math.round(620_000 * 16 / 31));
    expect(result[0].calculation.slices).toHaveLength(2);
  });

  it("keeps different currencies separate rather than inventing a conversion", () => {
    const result = monthlySalaryValues([
      { id: "inr", monthlyAmount: 100_000, currency: "INR", effectiveFrom: utc("2026-08-01"), effectiveTo: null },
      { id: "usd", monthlyAmount: 50_000, currency: "USD", effectiveFrom: utc("2026-08-01"), effectiveTo: null },
    ], "2026-08");
    expect(result.map((value) => value.currency)).toEqual(["INR", "USD"]);
  });
});
