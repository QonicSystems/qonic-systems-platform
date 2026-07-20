import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Anything younger than this is never purged, whatever is asked for. */
export const MINIMUM_RETAIN_DAYS = 30;

/**
 * Permanently deletes audit-log entries.
 *
 * This is the most destructive action in the application: the audit log is the
 * only record of who did what, so removing it removes the ability to answer
 * that question afterwards. It therefore carries more guards than anything else
 * here — super admin only, password re-entry, a typed confirmation phrase, and
 * a floor on how recent an entry may be.
 *
 * The purge itself is recorded, so the log can never be silently emptied: there
 * is always an entry saying it happened, who did it, and how much went.
 */
export async function DELETE(request: Request) {
  const { context, response } = await guardRoute("audit.view");
  if (response) return response;

  // Deliberately stricter than a permission toggle. Erasing the accountability
  // record is not something a delegated right should allow.
  if (!context.role.isSuperAdmin) {
    return NextResponse.json({ message: "Only the super admin can purge the audit log." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const password = String(input.password ?? "");
  const confirmation = String(input.confirmation ?? "").trim();
  const olderThanDays = Number(input.olderThanDays ?? MINIMUM_RETAIN_DAYS);

  // A stolen session must not be enough to destroy the evidence of its own use.
  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (!await verifyPassword(user.passwordHash, password)) {
    return NextResponse.json({ message: "That is not your current password." }, { status: 422 });
  }

  if (confirmation !== "PURGE AUDIT LOG") {
    return NextResponse.json({ message: "Type PURGE AUDIT LOG exactly to confirm." }, { status: 422 });
  }

  if (!Number.isInteger(olderThanDays) || olderThanDays < MINIMUM_RETAIN_DAYS) {
    return NextResponse.json({
      message: `Entries from the last ${MINIMUM_RETAIN_DAYS} days cannot be purged. Choose ${MINIMUM_RETAIN_DAYS} days or more.`,
    }, { status: 422 });
  }

  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const doomed = await db.auditLog.count({ where: { createdAt: { lt: cutoff } } });
  if (doomed === 0) {
    return NextResponse.json({ message: `There are no entries older than ${olderThanDays} days.` }, { status: 409 });
  }

  const oldest = await db.auditLog.findFirst({ where: { createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });

  await db.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    // Written AFTER the delete so it cannot be caught by its own cutoff, and
    // inside the same transaction so the two can never disagree.
    await recordAudit({
      actorId: context.user.id,
      action: "audit.purge",
      entityType: "AuditLog",
      entityId: null,
      before: { entries: doomed, oldest: oldest?.createdAt.toISOString() ?? null, cutoff: cutoff.toISOString() },
      after: { olderThanDays },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: `${doomed.toLocaleString()} entr${doomed === 1 ? "y" : "ies"} older than ${olderThanDays} days were permanently deleted. This purge has itself been recorded.`,
    purged: doomed,
  });
}
