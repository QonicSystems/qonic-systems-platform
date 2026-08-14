import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/app-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { RESET_TTL_MS, createResetToken, hashResetToken, resetEmail, resetUrl } from "@/lib/auth/reset";
import { captchaRejection } from "@/lib/captcha";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";
import { crossSiteRejection } from "@/lib/http/same-origin";
import { BUCKETS, rateLimitRejection } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Always answers the same way, whether or not the address is registered —
 * otherwise this endpoint becomes an account-enumeration oracle.
 */
const NEUTRAL = "If that email address has an account, a reset link is on its way.";

function smtp() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_FROM_EMAIL"] as const;
  if (required.some((name) => !process.env[name])) return null;
  return {
    host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! }, from: process.env.CONTACT_FROM_EMAIL!,
  };
}

export async function POST(request: Request) {
  const crossSite = crossSiteRejection(request.headers);
  if (crossSite) return crossSite;

  // Every accepted request mails a real person and invalidates the link they
  // may already be holding, so this doubles as a mail-bomb and a denial of
  // password recovery against a known address.
  const throttled = await rateLimitRejection(BUCKETS.forgotPassword, request);
  if (throttled) return throttled;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const captcha = await captchaRejection("forgot_password", input.captchaToken);
  if (captcha) return captcha;

  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);

  if (!emailPattern.test(email)) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { email: "Please enter a valid email address." } }, { status: 422 });
  }

  const user = await db.user.findUnique({ where: { email } });

  // Silently succeed for unknown or inactive accounts.
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ message: NEUTRAL });

  const token = createResetToken();
  await db.$transaction(async (tx) => {
    // Any earlier link becomes useless the moment a new one is issued.
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.passwordResetToken.create({
      data: { tokenHash: hashResetToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await recordAudit({ actorId: user.id, action: "auth.password_reset.request", entityType: "User", entityId: user.id, ipAddress: clientIp(request) }, tx);
  });

  const config = smtp();
  const url = resetUrl(appOrigin(), token);

  if (!config) {
    // Without SMTP the link cannot be delivered. Outside production, print it
    // so local development still works. In production the URL must never be
    // logged: it is a bearer token valid for an hour, and anyone with log
    // access — a drain, a shared dashboard, a later leak — could take over any
    // account by requesting a reset the victim never sees. Log the
    // misconfiguration instead, and keep the response neutral either way.
    if (process.env.NODE_ENV === "production") {
      console.error("[password-reset] SMTP is not configured — reset emails cannot be delivered.");
    } else {
      console.warn(`[password-reset] SMTP not configured. Reset link for ${email}: ${url}`);
    }
    return NextResponse.json({ message: NEUTRAL });
  }

  try {
    const { subject, text } = resetEmail(user.name, url);
    const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
    await transporter.sendMail({ from: config.from, to: user.email, subject, text });
  } catch (error) {
    // Still neutral: a delivery failure must not reveal that the account exists.
    console.error("Password reset email failed", error);
  }

  return NextResponse.json({ message: NEUTRAL });
}
