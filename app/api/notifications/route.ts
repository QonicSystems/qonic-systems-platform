import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Mark notifications read. Scoped to the caller so nobody can clear someone else's. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const ids = Array.isArray(input.ids) ? input.ids.map(String) : null;

  const { count } = await db.notification.updateMany({
    // The userId filter is what makes this safe — an id from another account
    // simply matches nothing.
    where: { userId: context.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ message: count === 0 ? "Nothing new." : `${count} marked as read.` });
}

/**
 * Permanently delete notifications. Scoped to the caller, like the read marker.
 *
 * This is a hard delete, not a hidden flag — a cleared inbox leaves nothing
 * behind in the database. Notifications are a convenience copy of things that
 * are recorded properly elsewhere (the audit log, the timesheet, the contract
 * letter), so losing them destroys no history.
 *
 * With no `ids`, everything the caller holds is removed. With `ids`, only those,
 * which is what the per-row dismiss sends.
 */
export async function DELETE(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  // A DELETE may legitimately carry no body, so a parse failure is not an error.
  let ids: string[] | null = null;
  try {
    const body = await request.json();
    const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    if (Array.isArray(input.ids)) ids = input.ids.map(String);
  } catch { /* no body — clear everything */ }

  const { count } = await db.$transaction(async (tx) => {
    const removed = await tx.notification.deleteMany({
      // The userId filter is what makes this safe: an id belonging to another
      // account matches nothing rather than deleting their notification.
      where: { userId: context.user.id, ...(ids ? { id: { in: ids } } : {}) },
    });
    // The rows themselves are gone for good, so the audit entry is the only
    // record that a wipe happened at all. Without it a cleared inbox is
    // indistinguishable from one that was never written to.
    if (removed.count > 0) {
      await recordAudit({
        actorId: context.user.id,
        action: ids ? "notification.dismiss" : "notification.clear_all",
        entityType: "Notification",
        entityId: context.user.id,
        before: { deleted: removed.count, scope: ids ? "selected" : "all" },
        ipAddress: clientIp(request),
      }, tx);
    }
    return removed;
  });

  if (count === 0) return NextResponse.json({ message: "There was nothing to clear." });
  return NextResponse.json({
    message: ids
      ? `${count} notification${count === 1 ? "" : "s"} cleared.`
      : `Inbox cleared — ${count} notification${count === 1 ? "" : "s"} permanently deleted.`,
  });
}
