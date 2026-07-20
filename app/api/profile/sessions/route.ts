import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Sign out everywhere else — keeps the caller's own session alive. */
export async function DELETE(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { count } = await db.session.deleteMany({ where: { userId: context.user.id, NOT: { id: context.sessionId } } });

  await recordAudit({
    actorId: context.user.id, action: "auth.sessions.revoke_others", entityType: "User", entityId: context.user.id,
    after: { revoked: count }, ipAddress: clientIp(request),
  });

  return NextResponse.json({
    message: count === 0 ? "You are not signed in anywhere else." : `Signed out of ${count} other device${count === 1 ? "" : "s"}.`,
  });
}
