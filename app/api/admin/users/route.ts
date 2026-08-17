import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/app-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAssignRole } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { INVITE_TTL_MS, createResetToken, hashResetToken, inviteEmail, resetUrl } from "@/lib/auth/reset";
import { emailPattern } from "@/lib/contact";
import { syncCandidateAndUsers } from "@/lib/ats/sync";
import { db } from "@/lib/db";
import { isUniqueEmailViolation } from "@/lib/db-errors";

export const runtime = "nodejs";

type CreateErrors = Partial<Record<"name" | "email" | "phone" | "jobTitle" | "roleId", string>>;

function smtp() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_FROM_EMAIL"] as const;
  if (required.some((name) => !process.env[name])) return null;
  return {
    host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! }, from: process.env.CONTACT_FROM_EMAIL!,
  };
}

/**
 * Create a colleague's account. Requires user.manage, plus the authority to
 * assign the role being given.
 *
 * The new account never receives a password anyone else knows: a random one is
 * hashed and immediately discarded, and the person sets their own through a
 * one-time invite link. `mustChangePassword` is belt-and-braces for the case
 * where an administrator hands the link over in person.
 *
 * If SMTP is unconfigured the account is still created and the link is returned
 * to the caller to pass on — the same graceful degradation as password reset,
 * because failing to create the account would be the worse outcome.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("user.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const data = {
    name: String(input.name ?? "").trim().slice(0, 200),
    email: String(input.email ?? "").trim().toLowerCase().slice(0, 320),
    phone: String(input.phone ?? "").trim().slice(0, 50),
    jobTitle: String(input.jobTitle ?? "").trim().slice(0, 200),
    roleId: String(input.roleId ?? "").trim(),
  };
  const techStack = String(input.techStack ?? "").trim().slice(0, 500);

  const errors: CreateErrors = {};
  if (data.name.length < 2) errors.name = "Please enter the person's name.";
  if (!emailPattern.test(data.email)) errors.email = "Please enter a valid work email.";
  if (!data.roleId) errors.roleId = "Please choose a role.";

  // Pre-check duplicate email on create.
  if (!errors.email && (await db.user.findUnique({ where: { email: data.email } }))) {
    errors.email = "An account already exists with that email address.";
  }

  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { roleId: "That role no longer exists." } }, { status: 422 });

  const assignable = canAssignRole(context, role);
  if (!assignable.ok) return NextResponse.json({ message: assignable.reason }, { status: assignable.status });

  // A random 32-byte password is generated so the account cannot be logged into
  // until the invite is accepted — no hardcoded "password123".
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const token = createResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  let created: { id: string; name: string; email: string };
  try {
    created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          jobTitle: data.jobTitle || null,
          techStack: techStack || null,
          roleId: role.id,
          passwordHash,
          mustChangePassword: true,
          resetTokens: { create: { tokenHash, expiresAt } },
        },
        select: { id: true, name: true, email: true },
      });
      await recordAudit({
        actorId: context.user.id, action: "user.create", entityType: "User", entityId: user.id,
        after: { name: data.name, email: data.email, role: role.key, techStack }, ipAddress: clientIp(request),
      }, tx);
      return user;
    });
  } catch (error) {
    if (isUniqueEmailViolation(error)) {
      return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { email: "Another account already uses that email address." } }, { status: 422 });
    }
    throw error;
  }

  await syncCandidateAndUsers();

  const url = resetUrl(appOrigin(), token);
  const config = smtp();
  let delivered = false;

  if (config) {
    try {
      const { subject, text } = inviteEmail(created.name, url, context.user.name);
      const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
      await transporter.sendMail({ from: config.from, to: created.email, subject, text });
      delivered = true;
    } catch (error) {
      // The account exists either way; the caller gets the link to pass on.
      console.error("Invite email failed", error);
    }
  }

  return NextResponse.json({
    message: delivered
      ? `${created.name} has been added — an invite is on its way to ${created.email}.`
      : `${created.name} has been added. Email is not configured here, so send them this link yourself.`,
    // Only returned when we could not deliver it; it is a bearer token.
    inviteUrl: delivered ? undefined : url,
  });
}
