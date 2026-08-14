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

/**
 * The same token, worded for someone who has never signed in. A new colleague
 * being told their password was "reset" would reasonably wonder who set it.
 * Given a longer life than a reset because an invite often waits for a start
 * date rather than being acted on within the hour.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function inviteEmail(name: string, url: string, inviter: string): { subject: string; text: string } {
  return {
    subject: "Your QONIC consulting account",
    text: [
      `Hello ${name},`,
      "",
      `${inviter} has created an account for you on the QONIC consulting staff portal.`,
      "Choose your password to get started:",
      url,
      "",
      "The link expires in seven days. If it lapses, use \"Forgotten your password?\" on the sign-in page.",
      "",
      "QONIC consulting",
    ].join("\n"),
  };
}

export function resetEmail(name: string, url: string): { subject: string; text: string } {
  return {
    subject: "Reset your QONIC consulting password",
    text: [
      `Hello ${name},`,
      "",
      "We received a request to reset your password. Open the link below to choose a new one:",
      url,
      "",
      "The link expires in one hour and can only be used once.",
      "If you did not request this, you can ignore this email — your password has not changed.",
      "",
      "QONIC consulting",
    ].join("\n"),
  };
}
