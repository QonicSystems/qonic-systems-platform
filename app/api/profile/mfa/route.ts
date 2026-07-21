import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { generateBackupCodes, generateSecret, provisioningUri, verifyCode } from "@/lib/auth/totp";
import { encrypt, decrypt, isEncryptionConfigured, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Step 1 of enrolment: mint a secret and hand back the otpauth URI to scan.
 *
 * `totpEnabled` stays false until a code is verified, so abandoning enrolment
 * halfway can never lock someone out of their own account.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  if (!isEncryptionConfigured()) {
    return NextResponse.json({ message: "Two-factor authentication is unavailable until ENCRYPTION_KEY is configured." }, { status: 503 });
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (user.totpEnabled) return NextResponse.json({ message: "Two-factor authentication is already switched on." }, { status: 409 });

  const secret = generateSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret) } });

  return NextResponse.json({
    message: "Scan this in your authenticator app, then enter a code to finish.",
    secret,
    uri: provisioningUri(secret, user.email),
  });
}

/** Step 2: confirm a code, switch it on, and issue recovery codes. */
export async function PUT(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const code = String(input.code ?? "");

  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (!user.totpSecretEnc) return NextResponse.json({ message: "Start enrolment first." }, { status: 409 });
  if (user.totpEnabled) return NextResponse.json({ message: "Two-factor authentication is already switched on." }, { status: 409 });

  if (!verifyCode(decrypt(user.totpSecretEnc), code)) {
    return NextResponse.json({ message: "That code is not right. Check your authenticator app and try again." }, { status: 422 });
  }

  // Shown once, stored hashed — same reasoning as passwords.
  const backupCodes = generateBackupCodes();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpBackupHashes: backupCodes.map((backup) => sha256(backup)).join("\n") },
    });
    await recordAudit({ actorId: user.id, action: "auth.mfa.enable", entityType: "User", entityId: user.id, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({
    message: "Two-factor authentication is on. Save these recovery codes — they are shown only once.",
    backupCodes,
  });
}

/** Turn it off. Requires the current password, not just a live session. */
export async function DELETE(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const password = String(input.password ?? "");

  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  // A stolen session should not be enough to strip a second factor.
  if (!await verifyPassword(user.passwordHash, password)) {
    return NextResponse.json({ message: "That is not your current password." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null, totpBackupHashes: null } });
    await recordAudit({ actorId: user.id, action: "auth.mfa.disable", entityType: "User", entityId: user.id, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: "Two-factor authentication has been turned off." });
}
