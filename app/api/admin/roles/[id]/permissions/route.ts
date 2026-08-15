import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { SUPER_ADMIN_ONLY_PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Flips a single role→permission toggle. This is the endpoint behind the CEO's
 * enable/disable matrix.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  const { id: roleId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const permissionKey = String(input.permissionKey ?? "");
  // A real boolean, not `=== true`: a missing or malformed field used to mean
  // "disable", so a malformed request silently revoked a capability.
  if (typeof input.enabled !== "boolean") {
    return NextResponse.json({ message: "Please submit a valid request." }, { status: 422 });
  }
  const enabled = input.enabled;

  const [role, permission] = await Promise.all([
    db.role.findUnique({ where: { id: roleId } }),
    db.permission.findUnique({ where: { key: permissionKey } }),
  ]);
  if (!role || !permission) return NextResponse.json({ message: "That role or permission no longer exists." }, { status: 404 });

  // The super admin's access is unconditional and is never read from these rows.
  // Allowing edits here would imply the CEO's own rights can be switched off.
  if (role.isSuperAdmin) {
    return NextResponse.json({ message: "Super-admin access cannot be modified." }, { status: 409 });
  }

  // Granting rbac.manage to another role would hand over full control, since
  // that permission can then grant everything else.
  if (enabled && SUPER_ADMIN_ONLY_PERMISSIONS.has(permission.key) && !context.role.isSuperAdmin) {
    return NextResponse.json({ message: "Only the super admin can grant this permission." }, { status: 403 });
  }

  // Rank guard: never edit a role at or above your own seniority.
  if (!context.role.isSuperAdmin && role.rank <= context.role.rank) {
    return NextResponse.json({ message: "You cannot change permissions for a role at or above your own level." }, { status: 403 });
  }

  const before = await db.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });

  await db.$transaction(async (tx) => {
    await tx.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { enabled, updatedById: context.user.id },
      create: { roleId: role.id, permissionId: permission.id, enabled, updatedById: context.user.id },
    });
    await recordAudit({
      actorId: context.user.id,
      action: "rbac.role_permission.toggle",
      entityType: "Role",
      entityId: role.id,
      before: { permission: permission.key, enabled: before?.enabled ?? false },
      after: { permission: permission.key, enabled },
      ipAddress: clientIp(request),
    }, tx);
  });

  // Nothing to invalidate: permissions are resolved from the database on every
  // request, so this takes effect on the affected users' very next page load.
  return NextResponse.json({ message: enabled ? `Enabled for ${role.label}.` : `Disabled for ${role.label}.` });
}
