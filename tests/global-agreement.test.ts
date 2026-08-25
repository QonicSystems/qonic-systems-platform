import { describe, expect, it } from "vitest";
import { dateLabel, emptyGlobalCandidateAgreementInput, validateGlobalCandidateAgreementInput } from "@/lib/global-agreements/payload";

describe("Global Candidate master agreement payload", () => {
  it("ships reusable commission and payment terms", () => {
    const result = validateGlobalCandidateAgreementInput(emptyGlobalCandidateAgreementInput);
    expect(result.errors).toEqual({});
    expect(result.data?.commissionTerms).toContain("commission");
    expect(result.data?.paymentTerms).toContain("Qonic Systems");
  });

  it("requires commercial terms and never needs an identity number", () => {
    const result = validateGlobalCandidateAgreementInput({ commissionTerms: "", paymentTerms: "", additionalTerms: "" });
    expect(result.errors.commissionTerms).toBeTruthy();
    expect(result.errors.paymentTerms).toBeTruthy();
    expect(dateLabel("2026-08-23T00:00:00.000Z")).toBe("23 August 2026");
  });
});
