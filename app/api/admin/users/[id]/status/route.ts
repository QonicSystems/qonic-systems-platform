import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Deactivate or restore an account. Requires user.deactivate. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.deactivate");
  if (response) return response;

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id }, include: { role: { select: { key: true, rank: true, isSuperAdmin: true, label: true } } } });
  if (!target) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canAdminister(context, target);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const active = input.active === true;
  const status = active ? "ACTIVE" : "SUSPENDED";

  if (target.status === status) return NextResponse.json({ message: `${target.name} is already ${active ? "active" : "deactivated"}.` });

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { status, failedLoginCount: 0, lockedUntil: null } });
    // Deactivating must take effect immediately, not whenever their session
    // happens to expire. (getAuthContext also rejects non-ACTIVE users, so this
    // is belt and braces — but it frees the rows and forces a clean re-login.)
    if (!active) await tx.session.deleteMany({ where: { userId: target.id } });
    await recordAudit({
      actorId: context.user.id,
      action: active ? "user.reactivate" : "user.deactivate",
      entityType: "User",
      entityId: target.id,
      before: { status: target.status },
      after: { status },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: active ? `${target.name} has been reactivated.` : `${target.name} has been deactivated and signed out.`,
  });
}
