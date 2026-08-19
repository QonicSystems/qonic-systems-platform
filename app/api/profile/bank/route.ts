import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/guard";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Your own reimbursement account. Self-service by design: nobody else needs to
 * see it, and no admin screen offers it.
 *
 * The three identifying fields are encrypted at rest; only `lastFour` and the
 * bank name are ever stored in the clear, which is all any screen needs to show
 * "we have your details on file". Nothing here ever reads them back — replacing
 * the record is the only way to change it.
 */
export async function PUT(request: Request) {
  const context = await requireAuth();

  if (!isEncryptionConfigured()) {
    return NextResponse.json({ message: "Bank details cannot be stored until ENCRYPTION_KEY is configured." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const accountName = String(input.accountName ?? "").trim();
  const accountNumber = String(input.accountNumber ?? "").replace(/[\s-]/g, "");
  const sortCode = String(input.sortCode ?? "").replace(/[\s-]/g, "");
  const bankName = String(input.bankName ?? "").trim();

  const errors: Record<string, string> = {};
  if (accountName.length < 2) errors.accountName = "Enter the name on the account.";
  if (!/^\d{6,18}$/.test(accountNumber)) errors.accountNumber = "Enter the account number — 6 to 18 digits.";
  if (!/^[A-Za-z0-9]{4,11}$/.test(sortCode)) errors.sortCode = "Enter the sort code, IFSC, or routing number.";
  if (Object.keys(errors).length) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  const existed = Boolean(await db.bankDetail.findUnique({ where: { userId: context.user.id } }));
  const data = {
    accountNameEnc: encrypt(accountName),
    accountNumberEnc: encrypt(accountNumber),
    sortCodeEnc: encrypt(sortCode.toUpperCase()),
    lastFour: accountNumber.slice(-4),
    bankName: bankName || null,
    updatedById: context.user.id,
  };

  await db.$transaction(async (tx) => {
    await tx.bankDetail.upsert({
      where: { userId: context.user.id },
      update: data,
      create: { userId: context.user.id, ...data },
    });
    // The values are never audited — only the fact that they changed.
    await recordAudit({
      actorId: context.user.id, action: existed ? "bank.update" : "bank.create",
      entityType: "BankDetail", entityId: context.user.id,
      after: { lastFour: data.lastFour, bankName: data.bankName },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: existed ? "Bank details updated." : "Bank details saved." });
}

/** Remove your account details. */
export async function DELETE(request: Request) {
  const context = await requireAuth();

  const existing = await db.bankDetail.findUnique({ where: { userId: context.user.id } });
  if (!existing) return NextResponse.json({ message: "There are no bank details to remove." }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.bankDetail.delete({ where: { userId: context.user.id } });
    await recordAudit({
      actorId: context.user.id, action: "bank.delete", entityType: "BankDetail",
      entityId: context.user.id, before: { lastFour: existing.lastFour },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Bank details removed." });
}
