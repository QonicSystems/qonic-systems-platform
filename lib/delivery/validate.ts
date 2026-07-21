import { emailPattern } from "@/lib/contact";

export type ClientPayload = { name: string; code: string; status: string; industry: string; website: string; ownerId: string; notes: string };
export type ClientErrors = Partial<Record<keyof ClientPayload, string>>;

export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "DORMANT", "ARCHIVED"] as const;
export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export const BILLING_MODELS = ["TIME_AND_MATERIALS", "FIXED_PRICE", "RETAINER", "NON_BILLABLE"] as const;

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
  };
  const errors: ClientErrors = {};

  if (data.name.length < 2) errors.name = "Please enter the client's name.";
  if (!CODE.test(data.code)) errors.code = "Use 2–10 uppercase letters or digits, e.g. ACME.";
  if (!CLIENT_STATUSES.includes(data.status as typeof CLIENT_STATUSES[number])) errors.status = "Please choose a status.";
  if (data.website && !/^https?:\/\//i.test(data.website)) errors.website = "The website must start with http:// or https://";

  return Object.keys(errors).length ? { errors } : { data, errors };
}

export type ProjectPayload = {
  name: string; code: string; clientId: string; status: string; billing: string;
  budgetAmount: string; budgetCurrency: string; defaultRate: string;
  startDate: string; endDate: string; managerId: string; notes: string;
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
    status: String(input.status ?? "PLANNED").trim(),
    billing: String(input.billing ?? "TIME_AND_MATERIALS").trim(),
    budgetAmount: String(input.budgetAmount ?? "").trim(),
    budgetCurrency: String(input.budgetCurrency ?? "INR").trim(),
    defaultRate: String(input.defaultRate ?? "").trim(),
    startDate: String(input.startDate ?? "").trim(),
    endDate: String(input.endDate ?? "").trim(),
    managerId: String(input.managerId ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
  };
  const errors: ProjectErrors = {};

  if (data.name.length < 2) errors.name = "Please enter the project name.";
  if (!CODE.test(data.code)) errors.code = "Use 2–10 uppercase letters or digits, e.g. WEB-01.";
  if (!data.clientId) errors.clientId = "Please choose a client.";
  if (!PROJECT_STATUSES.includes(data.status as typeof PROJECT_STATUSES[number])) errors.status = "Please choose a status.";
  if (!BILLING_MODELS.includes(data.billing as typeof BILLING_MODELS[number])) errors.billing = "Please choose a billing model.";
  if (Number.isNaN(toMinorUnits(data.budgetAmount))) errors.budgetAmount = "Enter the budget as a number, e.g. 250000.";
  if (Number.isNaN(toMinorUnits(data.defaultRate))) errors.defaultRate = "Enter the rate as a number, e.g. 3500.";
  if (data.startDate && !DATE.test(data.startDate)) errors.startDate = "Please enter a valid start date.";
  if (data.endDate && !DATE.test(data.endDate)) errors.endDate = "Please enter a valid end date.";
  if (data.startDate && data.endDate && data.endDate < data.startDate) errors.endDate = "The end date cannot be before the start date.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}

export { emailPattern };
