import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/app-origin";
import { inviteEmail, resetUrl } from "@/lib/auth/reset";

/**
 * Delivering a new account's one-time invite link.
 *
 * Extracted from POST /api/admin/users once a second route needed it — creating
 * an employee account from the Candidate Pool. Two copies of this would be two
 * places to get the graceful-degradation rule wrong, and that rule is the whole
 * point: if SMTP is unconfigured the account is still created and the link is
 * handed back to the caller, because failing to create the account is the worse
 * outcome.
 */

function smtpConfig() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_FROM_EMAIL"] as const;
  if (required.some((name) => !process.env[name])) return null;
  return {
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    from: process.env.CONTACT_FROM_EMAIL!,
  };
}

export type InviteDelivery = {
  /** The invite link. Always produced, whether or not it was emailed. */
  url: string;
  delivered: boolean;
};

/**
 * Emails the invite if SMTP is configured.
 *
 * `url` is a bearer token — only surface it to the caller when `delivered` is
 * false, or an invite link ends up in a response that had no need for it.
 */
export async function deliverInvite(
  { name, email, token, inviterName }: { name: string; email: string; token: string; inviterName: string },
): Promise<InviteDelivery> {
  const url = resetUrl(appOrigin(), token);
  const config = smtpConfig();
  if (!config) return { url, delivered: false };

  try {
    const { subject, text } = inviteEmail(name, url, inviterName);
    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure, auth: config.auth,
    });
    await transporter.sendMail({ from: config.from, to: email, subject, text });
    return { url, delivered: true };
  } catch (error) {
    // The account exists either way; the caller gets the link to pass on.
    console.error("Invite email failed", error);
    return { url, delivered: false };
  }
}
