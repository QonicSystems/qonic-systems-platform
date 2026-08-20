export type ContractPayload = {
  jobTitle: string;
  employmentType: string;
  startDate: string;
  endDate?: string;
  /**
   * Legacy — letters issued before the switch to monthly compensation still
   * carry this key and must keep rendering with it. Never written by new
   * drafts; kept only so old payloads still typecheck and print correctly.
   * See docs at the top of lib/contracts/templates.ts on why the old
   * standard-employment-v1/consulting-services-v1 templates were left in
   * place rather than edited.
   */
  annualSalary?: string;
  /** The figure per-day payout is calculated from — see lib/delivery/payout.ts. */
  monthlyCompensation?: string;
  currency: string;
  location: string;
  reportingTo: string;
  noticePeriod: string;
  additionalTerms: string;
};

export type ContractPayloadErrors = Partial<Record<keyof ContractPayload | "subjectUserId" | "templateKey", string>>;

export const EMPLOYMENT_TYPES = ["Full-time Contract", "Part-time Contract"] as const;
export const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED"] as const;

export const emptyContractPayload: ContractPayload = {
  jobTitle: "",
  employmentType: "Full-time Contract",
  startDate: "",
  endDate: "Till project is running",
  monthlyCompensation: "",
  currency: "INR",
  location: "",
  reportingTo: "Founder & Co-Founder",
  noticePeriod: "30 days",
  additionalTerms: "",
};

/**
 * True only for a real calendar date in YYYY-MM-DD form.
 *
 * `Date.parse("2026-02-31")` succeeds in JavaScript — it silently rolls over to
 * 3 March — so the parsed parts are compared back against the input. Without
 * this, an impossible start date would end up printed on a signed contract as a
 * different day than the one that was typed.
 */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** Mirrors validateContactPayload in lib/contact.ts: returns `data` only when valid. */
export function validateContractPayload(value: unknown): { data?: ContractPayload; errors: ContractPayloadErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: ContractPayload = {
    jobTitle: String(input.jobTitle ?? "").trim(),
    employmentType: String(input.employmentType ?? "").trim(),
    startDate: String(input.startDate ?? "").trim(),
    endDate: String(input.endDate ?? "Till project is running").trim(),
    monthlyCompensation: String(input.monthlyCompensation ?? "").trim(),
    currency: String(input.currency ?? "").trim(),
    location: String(input.location ?? "").trim(),
    reportingTo: String(input.reportingTo ?? "Founder & Co-Founder").trim(),
    noticePeriod: String(input.noticePeriod ?? "").trim(),
    additionalTerms: String(input.additionalTerms ?? "").trim(),
  };
  const errors: ContractPayloadErrors = {};

  if (data.jobTitle.length < 2) errors.jobTitle = "Please enter the job title.";
  if (!EMPLOYMENT_TYPES.includes(data.employmentType as typeof EMPLOYMENT_TYPES[number])) errors.employmentType = "Please choose an employment type.";
  if (!isRealDate(data.startDate)) errors.startDate = "Please enter a valid start date.";
  if (!/^\d[\d,]*(\.\d{1,2})?$/.test(data.monthlyCompensation ?? "")) errors.monthlyCompensation = "Please enter the monthly compensation as a number.";
  if (!CURRENCIES.includes(data.currency as typeof CURRENCIES[number])) errors.currency = "Please choose a currency.";
  if (data.location.length < 2) errors.location = "Please enter a work location.";
  if (!data.noticePeriod) errors.noticePeriod = "Please enter a notice period.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}

/**
 * Formats whichever compensation figure a letter's payload actually carries.
 * New letters (standard-employment-v2 onward) always have monthlyCompensation;
 * letters issued before that switch only ever have annualSalary — never both.
 */
export function formatCompensation(payload: ContractPayload): { label: string; value: string } {
  const raw = payload.monthlyCompensation ?? payload.annualSalary ?? "";
  const label = payload.monthlyCompensation ? "Monthly compensation" : "Annual salary";
  const amount = Number(raw.replace(/,/g, ""));
  const value = Number.isNaN(amount) ? `${payload.currency} ${raw}` : `${payload.currency} ${amount.toLocaleString("en-IN")}`;
  return { label, value };
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
