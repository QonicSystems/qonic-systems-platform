import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    // Delete by hash rather than id: the row is the session, so removing it is
    // what actually revokes access. deleteMany avoids throwing on an already
    // expired/absent row.
    const session = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    if (session) {
      await db.session.deleteMany({ where: { id: session.id } });
      await recordAudit({ actorId: session.userId, action: "auth.logout", entityType: "Session", entityId: session.id, ipAddress: clientIp(request) });
    }
  }

  store.delete(SESSION_COOKIE);
  return NextResponse.json({ message: "Signed out." });
}
