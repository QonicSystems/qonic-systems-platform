import { emailPattern } from "@/lib/contact";

export type ClientPayload = {
  name: string; code: string; status: string; industry: string; website: string; ownerId: string; notes: string;
  vendorId: string; globalCandidateId: string; employmentType: string; workArrangement: string;
  startDate: string; endDate: string; actualClientRate: string; rateCurrency: string;
  globalCandidateCommissionPercent: string; vendorCommissionPercent: string; projectName: string;
};
export type ClientErrors = Partial<Record<keyof ClientPayload, string>>;

// ARCHIVED is the retirement state for a client that cannot be deleted because
// it has projects, jobs, or invoices on record — the delete endpoint tells you
// to use it, so the validator has to accept it. CANCELLED plays the same role
// for a project.
export const CLIENT_STATUSES = ["ACTIVE", "UPCOMING", "RESCHEDULED", "CANCELLED", "ARCHIVED"] as const;
export const EMPLOYMENT_TYPES = ["W2", "C2C", "FULL_TIME"] as const;
export const WORK_ARRANGEMENTS = ["REMOTE", "HYBRID", "WFO"] as const;
export const PROJECT_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const;
export const BILLING_MODELS = ["TIME_AND_MATERIALS", "FIXED_PRICE", "RETAINER", "NON_BILLABLE"] as const;

/** The client status that takes a record out of day-to-day lists. */
export const CLIENT_ARCHIVED_STATUS = "ARCHIVED";
/** The project equivalent — ProjectStatus has no ARCHIVED member. */
export const PROJECT_ARCHIVED_STATUS = "CANCELLED";

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Running",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const BILLING_LABELS: Record<string, string> = {
  TIME_AND_MATERIALS: "Time & materials",
  FIXED_PRICE: "Fixed price",
  RETAINER: "Retainer",
  NON_BILLABLE: "Non-billable",
};

/** Short uppercase reference used in project codes, e.g. ACME. */
const CODE = /^[A-Z][A-Z0-9-]{1,9}$/;

export function validateClient(value: unknown): { data?: ClientPayload; errors: ClientErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: ClientPayload = {
    name: String(input.name ?? "").trim(),
    code: String(input.code ?? "").trim().toUpperCase(),
    status: String(input.status ?? "ACTIVE").trim(),
    industry: String(input.industry ?? "").trim(),
    website: String(input.website ?? "").trim(),
    ownerId: String(input.ownerId ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
    vendorId: String(input.vendorId ?? "").trim(),
    globalCandidateId: String(input.globalCandidateId ?? "").trim(),
    employmentType: String(input.employmentType ?? "").trim(),
    workArrangement: String(input.workArrangement ?? "").trim(),
    startDate: String(input.startDate ?? "").trim(),
    endDate: String(input.endDate ?? "").trim(),
    actualClientRate: String(input.actualClientRate ?? "").trim(),
    rateCurrency: String(input.rateCurrency ?? "USD").trim().toUpperCase(),
    globalCandidateCommissionPercent: String(input.globalCandidateCommissionPercent ?? "").trim(),
    vendorCommissionPercent: String(input.vendorCommissionPercent ?? "").trim(),
    projectName: String(input.projectName ?? "").trim(),
  };
  const errors: ClientErrors = {};

  if (data.name.length < 2) errors.name = "Please enter the client's name.";
  if (!CODE.test(data.code)) errors.code = "Use 2–10 uppercase letters or digits, e.g. ACME.";
  if (!CLIENT_STATUSES.includes(data.status as typeof CLIENT_STATUSES[number])) errors.status = "Please choose a status.";
  if (data.website && !/^https?:\/\//i.test(data.website)) errors.website = "The website must start with http:// or https://";
  if (data.employmentType && !EMPLOYMENT_TYPES.includes(data.employmentType as typeof EMPLOYMENT_TYPES[number])) errors.employmentType = "Choose W2, C2C, or Full Time.";
  if (data.workArrangement && !WORK_ARRANGEMENTS.includes(data.workArrangement as typeof WORK_ARRANGEMENTS[number])) errors.workArrangement = "Choose Remote, Hybrid, or WFO.";
  if (data.startDate && !DATE.test(data.startDate)) errors.startDate = "Please enter a valid start date.";
  if (data.endDate && !DATE.test(data.endDate)) errors.endDate = "Please enter a valid end date.";
  if (data.startDate && data.endDate && data.endDate < data.startDate) errors.endDate = "The end date cannot be before the start date.";
  const actualClientRate = toMinorUnits(data.actualClientRate);
  if (Number.isNaN(actualClientRate)) errors.actualClientRate = "Enter the rate as a number, e.g. 80.";
  if (!/^[A-Z]{3}$/.test(data.rateCurrency)) errors.rateCurrency = "Choose a currency.";
  for (const [key, value] of [
    ["globalCandidateCommissionPercent", data.globalCandidateCommissionPercent],
    ["vendorCommissionPercent", data.vendorCommissionPercent],
  ] as const) {
    if (value && (!/^\d{1,3}(\.\d{1,2})?$/.test(value) || Number(value) > 100)) {
      errors[key] = "Enter a percentage between 0 and 100.";
    }
  }
  // Supplying job terms means this is the job-procurement workflow, so a
  // candidate and the auto-created internal project need names as well.
  const hasCommercialTerms = Boolean(data.globalCandidateId || data.vendorId || data.employmentType || data.actualClientRate);
  if (hasCommercialTerms && !data.globalCandidateId) errors.globalCandidateId = "Choose the Global Candidate for this job.";
  if (hasCommercialTerms && !data.projectName) errors.projectName = "Enter the internal project name.";
  if (hasCommercialTerms && (!actualClientRate || actualClientRate <= 0)) errors.actualClientRate = "Enter the actual client rate for this job.";
  if (data.employmentType === "C2C" && !data.vendorId) errors.vendorId = "Choose the vendor that procured this C2C job.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}

export type ProjectPayload = {
  name: string; code: string; clientId: string; status: string; billing: string;
  budgetAmount: string; budgetCurrency: string; defaultRate: string;
  startDate: string; endDate: string; managerId: string; notes: string;
  negotiationCompleted: boolean; completedReason?: string;
};
export type ProjectErrors = Partial<Record<keyof ProjectPayload, string>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Money arrives as a decimal string and is stored in minor units. */
export function toMinorUnits(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(value.trim())) return Number.NaN;
  return Math.round(Number(value.trim().replace(",", ".")) * 100);
}

export function validateProject(value: unknown): { data?: ProjectPayload; errors: ProjectErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: ProjectPayload = {
    name: String(input.name ?? "").trim(),
    code: String(input.code ?? "").trim().toUpperCase(),
    clientId: String(input.clientId ?? "").trim(),
    status: String(input.status ?? "ACTIVE").trim(),
    billing: String(input.billing ?? "TIME_AND_MATERIALS").trim(),
    budgetAmount: String(input.budgetAmount ?? "").trim(),
    budgetCurrency: String(input.budgetCurrency ?? "INR").trim(),
    defaultRate: String(input.defaultRate ?? "").trim(),
    startDate: String(input.startDate ?? "").trim(),
    endDate: String(input.endDate ?? "").trim(),
    managerId: String(input.managerId ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
    negotiationCompleted: Boolean(input.negotiationCompleted),
    completedReason: input.completedReason ? String(input.completedReason).trim() : undefined,
  };
  const errors: ProjectErrors = {};

  if (data.name.length < 2) errors.name = "Please enter the project name.";
  if (!CODE.test(data.code)) errors.code = "Use 2–10 uppercase letters or digits, e.g. WEB-01.";
  if (!data.clientId) errors.clientId = "Please choose a client.";
  if (!PROJECT_STATUSES.includes(data.status as typeof PROJECT_STATUSES[number])) errors.status = "Please choose a status.";
  if (data.status === "COMPLETED" && !data.completedReason) errors.completedReason = "Please provide a completion reason.";
  if (!BILLING_MODELS.includes(data.billing as typeof BILLING_MODELS[number])) errors.billing = "Please choose a billing model.";
  if (Number.isNaN(toMinorUnits(data.budgetAmount))) errors.budgetAmount = "Enter the budget as a number, e.g. 250000.";
  if (Number.isNaN(toMinorUnits(data.defaultRate))) errors.defaultRate = "Enter the rate as a number, e.g. 3500.";
  if (data.startDate && !DATE.test(data.startDate)) errors.startDate = "Please enter a valid start date.";
  if (data.endDate && !DATE.test(data.endDate)) errors.endDate = "Please enter a valid end date.";
  if (data.startDate && data.endDate && data.endDate < data.startDate) errors.endDate = "The end date cannot be before the start date.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}

export { emailPattern };
