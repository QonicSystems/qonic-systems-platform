import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { SUPER_ADMIN_ONLY_PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * A per-person exception to their role's defaults.
 *
 * The guard has always honoured these — DENY beats ALLOW, and both lapse at
 * `expiresAt` — but nothing could create one, so the only lever was the role
 * matrix and granting one person one capability meant inventing a role.
 *
 * Held to rbac.manage, the same bar as editing the matrix itself: an override is
 * the matrix by another route, and anyone who could set one could grant
 * themselves anything.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    include: { role: { select: { key: true, rank: true, isSuperAdmin: true, label: true } } },
  });
  if (!target) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canAdminister(context, target);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const key = String(input.permission ?? "").trim();
  const effect = String(input.effect ?? "").trim();
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  const expiresRaw = String(input.expiresAt ?? "").trim();

  if (effect !== "ALLOW" && effect !== "DENY") {
    return NextResponse.json({ message: "Choose whether this allows or denies." }, { status: 422 });
  }
  const permission = await db.permission.findUnique({ where: { key } });
  if (!permission) return NextResponse.json({ message: "That capability does not exist." }, { status: 422 });

  // The CEO-only capabilities stay CEO-only; an override must not be a side door.
  if (effect === "ALLOW" && SUPER_ADMIN_ONLY_PERMISSIONS.has(key) && !target.role.isSuperAdmin) {
    return NextResponse.json({ message: `${permission.label} is reserved for the CEO and cannot be granted as an override.` }, { status: 409 });
  }
  if (reason.length < 3) return NextResponse.json({ message: "Please record why this exception exists." }, { status: 422 });

  let expiresAt: Date | null = null;
  if (expiresRaw) {
    expiresAt = new Date(`${expiresRaw}T23:59:59.000Z`);
    if (Number.isNaN(expiresAt.getTime())) return NextResponse.json({ message: "That expiry date is not valid." }, { status: 422 });
    if (expiresAt.getTime() < Date.now()) return NextResponse.json({ message: "The expiry date has already passed." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.userPermissionOverride.upsert({
      where: { userId_permissionId: { userId: id, permissionId: permission.id } },
      update: { effect: effect as never, reason, expiresAt },
      create: { userId: id, permissionId: permission.id, effect: effect as never, reason, expiresAt },
    });
    await recordAudit({
      actorId: context.user.id, action: "rbac.override.set", entityType: "User", entityId: id,
      after: { permission: key, effect, expiresAt: expiresAt?.toISOString() ?? null, reason },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: `${permission.label} ${effect === "ALLOW" ? "granted to" : "denied for"} ${target.name}${expiresAt ? ` until ${expiresRaw}` : ""}.`,
  });
}

/** Drop an exception, returning the person to their role's defaults. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  const { id } = await params;
  const key = new URL(request.url).searchParams.get("permission") ?? "";
  const permission = await db.permission.findUnique({ where: { key } });
  if (!permission) return NextResponse.json({ message: "That capability does not exist." }, { status: 404 });

  const existing = await db.userPermissionOverride.findUnique({
    where: { userId_permissionId: { userId: id, permissionId: permission.id } },
  });
  if (!existing) return NextResponse.json({ message: "There is no exception to remove." }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.userPermissionOverride.delete({ where: { userId_permissionId: { userId: id, permissionId: permission.id } } });
    await recordAudit({
      actorId: context.user.id, action: "rbac.override.clear", entityType: "User", entityId: id,
      before: { permission: key, effect: existing.effect }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${permission.label} exception removed — back to role defaults.` });
}
