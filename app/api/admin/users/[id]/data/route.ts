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
 *
 * Export is all this route does. The DELETE that used to sit alongside it
 * anonymised the account to "Erased User" in place, which destroyed the one
 * thing an archived record is kept for — knowing who it belonged to. Archiving
 * (DELETE /api/admin/users/[id]) revokes access and keeps the name.
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
