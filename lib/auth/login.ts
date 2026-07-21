import { emailPattern } from "@/lib/contact";

export type LoginPayload = { email: string; password: string };
export type LoginErrors = Partial<Record<keyof LoginPayload, string>>;

/**
 * Mirrors validateContactPayload in lib/contact.ts.
 *
 * Note this only checks that the fields were FILLED IN. It deliberately does not
 * report "no account with that email" — see the login route, which returns one
 * generic message for every credential failure.
 */
export function validateLoginPayload(value: unknown): { data?: LoginPayload; errors: LoginErrors } {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const data: LoginPayload = {
    email: String(input.email ?? "").trim().toLowerCase(),
    password: String(input.password ?? ""),
  };
  const errors: LoginErrors = {};

  if (!emailPattern.test(data.email)) errors.email = "Please enter a valid email address.";
  if (!data.password) errors.password = "Please enter your password.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}
