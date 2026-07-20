import { createHash, randomBytes } from "node:crypto";

/** Short-lived on purpose: long enough to check email, short enough to limit exposure. */
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function createResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, exactly as with session tokens. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetUrl(origin: string, token: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetEmail(name: string, url: string): { subject: string; text: string } {
  return {
    subject: "Reset your Avenstrix Consulting password",
    text: [
      `Hello ${name},`,
      "",
      "We received a request to reset your password. Open the link below to choose a new one:",
      url,
      "",
      "The link expires in one hour and can only be used once.",
      "If you did not request this, you can ignore this email — your password has not changed.",
      "",
      "Avenstrix Consulting",
    ].join("\n"),
  };
}
