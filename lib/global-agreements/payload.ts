export type GlobalCandidateAgreementPayload = {
  version: "global-candidate-master-v1";
  candidateName: string;
  candidateEmail: string;
  location: string;
  skills: string;
  visaType: string;
  visaStatus: string;
  visaExpiry: string;
  commissionTerms: string;
  paymentTerms: string;
  additionalTerms: string;
};

export type GlobalCandidateAgreementInput = Pick<GlobalCandidateAgreementPayload, "commissionTerms" | "paymentTerms" | "additionalTerms">;
export type GlobalCandidateAgreementErrors = Partial<Record<keyof GlobalCandidateAgreementInput | "candidateId", string>>;

export const emptyGlobalCandidateAgreementInput: GlobalCandidateAgreementInput = {
  commissionTerms: "Commission for each client opportunity will be documented in the applicable client commission schedule before submission.",
  paymentTerms: "Any earned commission is payable after Qonic Systems receives the corresponding payment from the vendor or client, subject to the applicable commission schedule.",
  additionalTerms: "",
};

export function validateGlobalCandidateAgreementInput(value: unknown): { data?: GlobalCandidateAgreementInput; errors: GlobalCandidateAgreementErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: GlobalCandidateAgreementInput = {
    commissionTerms: String(input.commissionTerms ?? "").trim(),
    paymentTerms: String(input.paymentTerms ?? "").trim(),
    additionalTerms: String(input.additionalTerms ?? "").trim(),
  };
  const errors: GlobalCandidateAgreementErrors = {};
  if (data.commissionTerms.length < 10) errors.commissionTerms = "Describe how the candidate's commission is determined.";
  if (data.paymentTerms.length < 10) errors.paymentTerms = "Describe when commission is payable.";
  if (data.additionalTerms.length > 4_000) errors.additionalTerms = "Additional terms must be 4,000 characters or fewer.";
  return Object.keys(errors).length ? { errors } : { data, errors };
}

export function dateLabel(value: string): string {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
