import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GDPR subject access request: everything held about one person, as JSON.
 *
 * Deliberately excludes secrets (password hash, TOTP secret, session tokens) —
 * those are credentials, not personal data, and exporting them would create a
 * new exposure rather than satisfy a right.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.view");
  if (response) return response;

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      role: { select: { key: true, label: true, rank: true, isSuperAdmin: true } },
      bankDetail: { select: { lastFour: true, bankName: true, updatedAt: true } },
      leaveRequests: { include: { leaveType: { select: { label: true } } } },
      leaveBalances: { include: { leaveType: { select: { label: true } } } },
      timesheets: { include: { entries: true } },
      expenses: true,
      contractsSubject: { select: { reference: true, status: true, payload: true, releasedAt: true } },
      notifications: { select: { kind: true, title: true, createdAt: true, readAt: true } },
    },
  });
  if (!user) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  // You may only export the data of someone you could administer.
  const authority = canAdminister(context, user);
  if (!authority.ok && context.user.id !== id) {
    return NextResponse.json({ message: authority.reason }, { status: authority.status });
  }

  await recordAudit({
    actorId: context.user.id, action: "gdpr.export", entityType: "User", entityId: id,
    after: { subject: user.email }, ipAddress: clientIp(request),
  });

  const { passwordHash, totpSecretEnc, totpBackupHashes, ...safe } = user;
  void passwordHash; void totpSecretEnc; void totpBackupHashes;

  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), subject: safe }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="qonic-data-${user.email}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Right to erasure. Anonymises rather than deletes: financial and contractual
 * records must survive, but they no longer need to name anyone.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.delete");
  if (response) return response;

  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canAdminister(context, user);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  const anonymousEmail = `erased-${user.id.slice(-8)}@erased.invalid`;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: "Erased User", email: anonymousEmail, phone: null, photoUrl: null,
        address: null, dateOfBirth: null,
        emergencyName: null, emergencyPhone: null, emergencyRelation: null,
        jobTitle: null, employeeCode: null,
        status: "ARCHIVED",
        totpSecretEnc: null, totpEnabled: false, totpBackupHashes: null,
      },
    });
    // Identifiers and credentials go; the shape of the record stays.
    await tx.bankDetail.deleteMany({ where: { userId: id } });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await tx.notification.deleteMany({ where: { userId: id } });
    await recordAudit({
      actorId: context.user.id, action: "gdpr.erase", entityType: "User", entityId: id,
      before: { name: user.name, email: user.email }, after: { email: anonymousEmail },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: `${user.name} has been erased. Timesheets, invoices, and contract letters remain for legal and financial continuity, but no longer identify them.`,
  });
}
