import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

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

  // Demand a real boolean. `input.active === true` silently treated a missing or
  // malformed field as "deactivate", so a POST with an empty body suspended
  // whoever the URL pointed at.
  if (typeof input.active !== "boolean") {
    return NextResponse.json({ message: "Please submit a valid request.", errors: { active: "Expected true or false." } }, { status: 422 });
  }
  const active = input.active;
  const status = active ? "ACTIVE" : "SUSPENDED";

  // A no-op is a conflict, not a success. Returning 200 here painted a green
  // "already active" notice, which is exactly what a stale row produces — so
  // the one case that needed a correction looked like it had worked.
  if (target.status === status) {
    return NextResponse.json({ message: `${target.name} is already ${active ? "active" : "deactivated"}.` }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { status, failedLoginCount: 0, lockedUntil: null } });
    // Tell them why they were signed out. Without this a deactivation is
    // indistinguishable from the app breaking.
    await notify({
      userId: target.id,
      kind: "SYSTEM",
      title: active ? "Your account has been reactivated" : "Your account has been deactivated",
      body: active
        ? "You can sign in again."
        : "An administrator deactivated your account. Contact them if you think this is a mistake.",
    }, tx);
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
