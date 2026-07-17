export type ContactPayload = {
  name: string;
  email: string;
  phone?: string;
  industry: string;
  message: string;
};

export type ContactErrors = Partial<Record<keyof ContactPayload, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactPayload(value: unknown): {
  data?: ContactPayload;
  errors: ContactErrors;
} {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: ContactPayload = {
    name: String(input.name ?? "").trim(),
    email: String(input.email ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    industry: String(input.industry ?? "").trim(),
    message: String(input.message ?? "").trim(),
  };
  const errors: ContactErrors = {};

  if (data.name.length < 2) errors.name = "Please enter a name with at least 2 characters.";
  if (!emailPattern.test(data.email)) errors.email = "Please enter a valid email address.";
  if (!data.industry) errors.industry = "Please select an industry.";
  if (data.message.length < 10) errors.message = "Please enter at least 10 characters.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}
