import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { validateLoginPayload } from "@/lib/auth/login";
import { verifyDummyPassword, verifyPassword } from "@/lib/auth/password";
import { ABSOLUTE_TTL_MS, IDLE_TTL_MS, SESSION_COOKIE, createSessionToken, hashSessionToken, safeRedirectPath, sessionCookieOptions } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * One generic message for every credential failure. This is a deliberate
 * departure from the per-field `errors` convention in lib/contact.ts: telling a
 * caller which half was wrong would let them enumerate registered emails.
 * Please do not "fix" this into field-level errors.
 */
const GENERIC_FAILURE = "Email or password is incorrect.";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const { data, errors } = validateLoginPayload(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const user = await db.user.findUnique({ where: { email: data.email }, include: { role: true } });

  // Always spend the same CPU when the account is missing, so response timing
  // does not reveal which addresses exist.
  if (!user) {
    await verifyDummyPassword(data.password);
    return NextResponse.json({ message: GENERIC_FAILURE }, { status: 401 });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json({ message: "Too many failed attempts. Please try again in a few minutes." }, { status: 429 });
  }

  if (!await verifyPassword(user.passwordHash, data.password)) {
    const failedLoginCount = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil: failedLoginCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null },
    });
    await recordAudit({ actorId: user.id, action: "auth.login.failed", entityType: "User", entityId: user.id, ipAddress: clientIp(request) });
    return NextResponse.json({ message: GENERIC_FAILURE }, { status: 401 });
  }

  // Correct password, but the account is not permitted to sign in. Kept distinct
  // from the credential message because it is not a guessing signal — you must
  // already hold valid credentials to see it.
  if (user.status !== "ACTIVE") {
    await recordAudit({ actorId: user.id, action: "auth.login.blocked", entityType: "User", entityId: user.id, after: { status: user.status }, ipAddress: clientIp(request) });
    return NextResponse.json({ message: "This account is not active. Please contact your administrator." }, { status: 403 });
  }

  const token = createSessionToken();
  const now = Date.now();
  const expiresAt = new Date(now + IDLE_TTL_MS);

  await db.$transaction(async (tx) => {
    await tx.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt,
        absoluteExpiresAt: new Date(now + ABSOLUTE_TTL_MS),
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await recordAudit({ actorId: user.id, action: "auth.login.success", entityType: "User", entityId: user.id, ipAddress: clientIp(request) }, tx);
  });

  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  const requested = typeof (body as Record<string, unknown>)?.next === "string" ? (body as Record<string, string>).next : null;
  return NextResponse.json({
    message: "Signed in.",
    // Force the password change before anything else when bootstrapped.
    redirectTo: user.mustChangePassword ? "/profile/security?first=1" : safeRedirectPath(requested),
  });
}
