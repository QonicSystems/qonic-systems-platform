import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAssignRole } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { deliverInvite } from "@/lib/auth/invite";
import { hashPassword } from "@/lib/auth/password";
import { INVITE_TTL_MS, createResetToken, hashResetToken } from "@/lib/auth/reset";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";
import { isUniqueEmailViolation } from "@/lib/db-errors";
import { parseCompensationInput } from "@/lib/finance/compensation";

export const runtime = "nodejs";

type CreateErrors = Partial<Record<"name" | "email" | "phone" | "jobTitle" | "roleId" | "monthlyCompensation" | "currency" | "effectiveFrom", string>>;

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
  const wantsCompensation = String(input.monthlyCompensation ?? "").trim().length > 0;

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

  // Employee, and any other role the CEO marks the same way, is created
  // from the Candidate Pool so the account always has a candidate record and a
  // contract letter behind it. Creating one here would produce a delivery
  // account with neither. The dialog disables these options, but that is
  // cosmetic — this is the check that counts.
  //
  // 422 with a `roleId` field error so the existing form renders it inline.
  if (role.viaCandidatePool) {
    return NextResponse.json({
      message: "Please correct the highlighted fields.",
      errors: { roleId: `${role.label} accounts are added from the Candidate Pool. Add the candidate there, then create their employee account.` },
    }, { status: 422 });
  }

  // Salary can be decided at People onboarding, but only by the two founder
  // roles. The standalone compensation route applies the same restriction.
  const founderFinance = context.role.isSuperAdmin || context.role.key === "co_founder";
  let compensation: ReturnType<typeof parseCompensationInput>["data"];
  if (wantsCompensation) {
    if (!founderFinance || !context.permissions.has("compensation.manage")) {
      return NextResponse.json({ message: "Only the CEO or Co-Founder may set compensation." }, { status: 403 });
    }
    const parsed = parseCompensationInput(input);
    if (!parsed.data) {
      return NextResponse.json({ message: "Please correct the highlighted fields.", errors: parsed.errors }, { status: 422 });
    }
    compensation = parsed.data;
  }

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
          ...(compensation ? {
            compensationProfiles: {
              create: {
                monthlyAmount: compensation.monthlyAmount,
                currency: compensation.currency,
                effectiveFrom: compensation.effectiveFrom,
                note: compensation.note || null,
                setById: context.user.id,
              },
            },
          } : {}),
        },
        select: { id: true, name: true, email: true },
      });
      await recordAudit({
        actorId: context.user.id, action: "user.create", entityType: "User", entityId: user.id,
        after: { name: data.name, email: data.email, role: role.key, techStack, compensation: compensation ? { monthlyAmount: compensation.monthlyAmount, currency: compensation.currency, effectiveFrom: compensation.effectiveFrom.toISOString().slice(0, 10) } : null }, ipAddress: clientIp(request),
      }, tx);
      return user;
    });
  } catch (error) {
    if (isUniqueEmailViolation(error)) {
      return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { email: "Another account already uses that email address." } }, { status: 422 });
    }
    throw error;
  }

  const { url, delivered } = await deliverInvite({
    name: created.name, email: created.email, token, inviterName: context.user.name,
  });

  return NextResponse.json({
    message: delivered
      ? `${created.name} has been added${compensation ? " with their salary schedule" : ""} — an invite is on its way to ${created.email}.`
      : `${created.name} has been added${compensation ? " with their salary schedule" : ""}. Email is not configured here, so send them this link yourself.`,
    // Only returned when we could not deliver it; it is a bearer token.
    inviteUrl: delivered ? undefined : url,
  });
}
