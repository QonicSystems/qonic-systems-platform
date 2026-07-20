import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { describePasswordProblem, hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type PasswordErrors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

export async function POST(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "");
  const confirmPassword = String(input.confirmPassword ?? "");

  const errors: PasswordErrors = {};
  if (!currentPassword) errors.currentPassword = "Please enter your current password.";
  const problem = describePasswordProblem(newPassword);
  if (problem) errors.newPassword = problem;
  if (newPassword !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
  if (currentPassword && newPassword && currentPassword === newPassword) errors.newPassword = "Please choose a password you have not used before.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (!await verifyPassword(user.passwordHash, currentPassword)) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { currentPassword: "That is not your current password." } }, { status: 422 });
  }

  const passwordHash = await hashPassword(newPassword);

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    // Changing a password revokes every OTHER session — if the account was
    // compromised, this is what actually evicts the attacker. The current
    // session is kept so the user is not bounced out of the form they just used.
    await tx.session.deleteMany({ where: { userId: user.id, NOT: { id: context.sessionId } } });
    await recordAudit({ actorId: user.id, action: "profile.password.change", entityType: "User", entityId: user.id, ipAddress: clientIp(request) }, tx);
  });

  // Defensive: if the cookie somehow no longer matches a live session, clear it.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && !await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } })) (await cookies()).delete(SESSION_COOKIE);

  return NextResponse.json({ message: "Password updated. Other devices have been signed out." });
}
