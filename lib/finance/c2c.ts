/**
 * C2C commercial mathematics. All routes, invoices, vendor views, and reports
 * use this module so a commission can never be calculated differently on two
 * screens. Values are minor currency units.
 */

export type C2CCommissionInput = {
  grossClientAmount: number;
  globalCandidateCommissionPercent: number;
  vendorCommissionPercent: number;
};

export type C2CCommissionBreakdown = {
  grossClientAmount: number;
  globalCandidateCommissionAmount: number;
  vendorCommissionAmount: number;
  qonicRevenueAmount: number;
};

/** Percentages are validated once at the commercial boundary. */
export function validCommissionPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Splits the vendor-received gross amount exactly once. Rounding happens on
 * each commission and Qonic receives the residual, so the invariant holds in
 * integer minor units: gross = global candidate + vendor + Qonic.
 */
export function c2cCommissionBreakdown(input: C2CCommissionInput): C2CCommissionBreakdown {
  const grossClientAmount = Math.max(0, Math.round(input.grossClientAmount));
  if (!validCommissionPercent(input.globalCandidateCommissionPercent)) {
    throw new Error("Global Candidate commission must be between 0% and 100%.");
  }
  if (!validCommissionPercent(input.vendorCommissionPercent)) {
    throw new Error("Vendor commission must be between 0% and 100%.");
  }

  const globalCandidateCommissionAmount = Math.round(
    (grossClientAmount * input.globalCandidateCommissionPercent) / 100
  );
  const vendorCommissionAmount = Math.round(
    (grossClientAmount * input.vendorCommissionPercent) / 100
  );
  const qonicRevenueAmount = grossClientAmount - globalCandidateCommissionAmount - vendorCommissionAmount;

  if (qonicRevenueAmount < 0) {
    throw new Error("Combined vendor and Global Candidate commissions cannot exceed 100%.");
  }

  return { grossClientAmount, globalCandidateCommissionAmount, vendorCommissionAmount, qonicRevenueAmount };
}

export const COMMERCIAL_INVOICE_LABEL: Record<string, string> = {
  STANDARD: "Standard invoice",
  QONIC_TO_VENDOR: "Qonic invoice to vendor",
  VENDOR_TO_GLOBAL_CANDIDATE: "Vendor payment to Global Candidate",
  GLOBAL_CANDIDATE_COMMISSION_RECORD: "Global Candidate commission record",
};
