import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { requirePermission } from "@/lib/auth/guard";
import { SUPER_ADMIN_ONLY_PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const metadata = { title: "Roles & Permissions" };

/**
 * The CEO's control panel: one switch per role × capability. Changes apply on
 * the affected user's next request — permissions are read from the database
 * every time, never cached into a token.
 */
export default async function PermissionsPage() {
  await requirePermission("rbac.manage");

  const [roles, permissions] = await Promise.all([
    db.role.findMany({ orderBy: { rank: "asc" }, include: { permissions: true } }),
    db.permission.findMany({ orderBy: [{ sortOrder: "asc" }] }),
  ]);

  const initial: Record<string, boolean> = {};
  for (const role of roles) {
    for (const entry of role.permissions) {
      const permission = permissions.find((candidate) => candidate.id === entry.permissionId);
      if (permission) initial[`${role.id}:${permission.key}`] = entry.enabled;
    }
  }

  return <section className="portal-section">
    <h2 className="portal-section-title">Who can do what</h2>
    <p className="portal-note">
      Switch capabilities on or off for each role. The CEO always retains every capability, so this control can never lock you out.
    </p>
    <PermissionMatrix
      roles={roles.map(({ id, key, label, isSuperAdmin, rank }) => ({ id, key, label, isSuperAdmin, rank }))}
      permissions={permissions.map(({ key, group, label, description }) => ({ key, group, label, description: description ?? "" }))}
      initial={initial}
      superAdminOnly={[...SUPER_ADMIN_ONLY_PERMISSIONS]}
    />
  </section>;
}
