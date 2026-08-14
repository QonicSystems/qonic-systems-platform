import { NextResponse } from "next/server";
import { crossSiteRejection } from "@/lib/http/same-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { describePasswordProblem, hashPassword } from "@/lib/auth/password";
import { hashResetToken } from "@/lib/auth/reset";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Errors = Partial<Record<"password" | "confirmPassword" | "token", string>>;

export async function POST(request: Request) {
  const crossSite = crossSiteRejection(request.headers);
  if (crossSite) return crossSite;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const token = String(input.token ?? "");
  const password = String(input.password ?? "");
  const confirmPassword = String(input.confirmPassword ?? "");

  const errors: Errors = {};
  const problem = describePasswordProblem(password);
  if (problem) errors.password = problem;
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const record = token ? await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { user: true } }) : null;

  // One message for every bad-token case — expired, used, or fabricated — so the
  // endpoint cannot be used to probe which tokens exist.
  if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE") {
    return NextResponse.json({ message: "That reset link is invalid or has expired. Please request a new one." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
    // Single use.
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Resetting a password is the recovery path from a compromise, so every
    // existing session is destroyed — including any the attacker holds.
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await recordAudit({ actorId: record.userId, action: "auth.password_reset.complete", entityType: "User", entityId: record.userId, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: "Your password has been reset. You can now sign in." });
}
