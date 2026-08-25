import { describe, expect, it } from "vitest";
import { c2cCommissionBreakdown, validCommissionPercent } from "@/lib/finance/c2c";

describe("C2C commission breakdown", () => {
  it("reconciles gross billing to Qonic, vendor, and Global Candidate amounts", () => {
    const result = c2cCommissionBreakdown({
      grossClientAmount: 800_000,
      globalCandidateCommissionPercent: 20,
      vendorCommissionPercent: 20,
    });
    expect(result).toEqual({
      grossClientAmount: 800_000,
      globalCandidateCommissionAmount: 160_000,
      vendorCommissionAmount: 160_000,
      qonicRevenueAmount: 480_000,
    });
    expect(result.grossClientAmount).toBe(
      result.qonicRevenueAmount + result.vendorCommissionAmount + result.globalCandidateCommissionAmount
    );
  });

  it("keeps the reconciliation exact when percentage rounding creates a minor-unit remainder", () => {
    const result = c2cCommissionBreakdown({
      grossClientAmount: 100_001,
      globalCandidateCommissionPercent: 12.5,
      vendorCommissionPercent: 17.5,
    });
    expect(result.grossClientAmount).toBe(
      result.qonicRevenueAmount + result.vendorCommissionAmount + result.globalCandidateCommissionAmount
    );
  });

  it("rejects a commission split above the gross amount", () => {
    expect(() => c2cCommissionBreakdown({
      grossClientAmount: 100_000,
      globalCandidateCommissionPercent: 60,
      vendorCommissionPercent: 60,
    })).toThrow(/cannot exceed/i);
  });

  it.each([-1, 0, 20, 100, 101])("validates %s as a commission percentage", (value) => {
    expect(validCommissionPercent(value)).toBe(value >= 0 && value <= 100);
  });
});
