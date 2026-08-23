import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { deliverInvite } from "@/lib/auth/invite";
import { hashPassword } from "@/lib/auth/password";
import { INVITE_TTL_MS, createResetToken, hashResetToken } from "@/lib/auth/reset";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { isUniqueEmailViolation } from "@/lib/db-errors";

export const runtime = "nodejs";

/**
 * Gives a candidate a staff account, and records the Candidate → User link.
 *
 * This is the only way a Candidate Pool role's account is created: POST
 * /api/admin/users refuses any role flagged `viaCandidatePool`, so an account in
 * one of those roles always has a candidate record behind it.
 *
 * It replaces a side effect of rendering `/contracts/new?candidateId=…`, which
 * created the account during a GET — so it fired on any prefetch or refresh of
 * that URL — and stamped a literal `"INVITED_CANDIDATE_NO_LOGIN_YET"` as the
 * password hash. That is not a valid argon2 hash, so `verifyPassword` treated
 * every attempt as a wrong password: the account could never be signed into and
 * had no invite to accept. Here the person gets the same real one-time invite as
 * anyone added through People.
 *
 * Takes `user.manage` rather than `candidate.manage`: it creates a login
 * account, which is the account-creation permission's business, not the
 * recruiter's.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.manage");
  if (response) return response;

  const { id } = await params;
  const candidate = await db.candidate.findUnique({
    where: { id },
    include: { linkedUser: { select: { id: true, name: true } } },
  });
  if (!candidate) return NextResponse.json({ message: "That candidate no longer exists." }, { status: 404 });

  if (candidate.linkedUser) {
    return NextResponse.json({
      message: `${candidate.name} already has a staff account (${candidate.linkedUser.name}).`,
    }, { status: 409 });
  }

  // Developer, by key. This used to be `findFirst({ viaCandidatePool: true })`,
  // which was a mistake twice over: the flag was briefly settable when creating
  // a role, so any custom role could claim it, and `findFirst` then handed out
  // whichever one happened to sort first. Deleting the Developer role once was
  // enough to make onboarding silently assign "Marketers" instead. Developer is
  // a protected built-in and the seed re-creates it, so this always resolves.
  const role = await db.role.findUnique({ where: { key: ROLE.DEVELOPER } });
  if (!role) {
    return NextResponse.json({
      message: "The Developer role is missing from this workspace. Run the database seed to restore it.",
    }, { status: 409 });
  }

  const email = candidate.email.trim().toLowerCase();

  // An account may already exist under this address — most likely one the old
  // contract-draft path created. Linking to it is the repair, and makes the
  // action idempotent; creating a second account would just fail on the unique
  // email anyway, with a far less useful message.
  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (existingUser) {
    await db.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id: candidate.id }, data: { linkedUserId: existingUser.id } });
      await recordAudit({
        actorId: context.user.id,
        action: "candidate.link",
        entityType: "Candidate",
        entityId: candidate.id,
        before: { linkedUserId: null },
        after: { linkedUserId: existingUser.id },
        ipAddress: clientIp(request),
      }, tx);
    });
    return NextResponse.json({
      message: `${candidate.name} is now linked to the existing account for ${email}. No new invite was sent.`,
    });
  }

  // A random 32-byte password, hashed and immediately discarded — the person
  // sets their own through the invite, exactly as in POST /api/admin/users.
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const token = createResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  let created: { id: string; name: string; email: string };
  try {
    created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: candidate.name,
          email,
          phone: candidate.phone,
          techStack: candidate.techStack ?? candidate.skills,
          roleId: role.id,
          passwordHash,
          mustChangePassword: true,
          resetTokens: { create: { tokenHash, expiresAt } },
        },
        select: { id: true, name: true, email: true },
      });

      await recordAudit({
        actorId: context.user.id,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        after: { name: user.name, email: user.email, role: role.key, fromCandidateId: candidate.id },
        ipAddress: clientIp(request),
      }, tx);

      await tx.candidate.update({ where: { id: candidate.id }, data: { linkedUserId: user.id } });
      await recordAudit({
        actorId: context.user.id,
        action: "candidate.link",
        entityType: "Candidate",
        entityId: candidate.id,
        before: { linkedUserId: null },
        after: { linkedUserId: user.id },
        ipAddress: clientIp(request),
      }, tx);

      return user;
    });
  } catch (error) {
    if (isUniqueEmailViolation(error)) {
      // The read above is not a lock, so a concurrent create can land between.
      return NextResponse.json({ message: "An account already uses that email address. Reload and try again." }, { status: 409 });
    }
    throw error;
  }

  const { url, delivered } = await deliverInvite({
    name: created.name, email: created.email, token, inviterName: context.user.name,
  });

  return NextResponse.json({
    message: delivered
      ? `${created.name} now has a ${role.label} account — an invite is on its way to ${created.email}.`
      : `${created.name} now has a ${role.label} account. Email is not configured here, so send them this link yourself.`,
    // A bearer token: only ever returned when it could not be emailed.
    inviteUrl: delivered ? undefined : url,
  });
}
