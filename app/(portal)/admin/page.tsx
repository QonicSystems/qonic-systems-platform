import { PeopleTable, type PersonRow } from "@/components/admin/people-table";
import { canAdminister, canAssignRole, canEditIdentity, describeAuthority } from "@/lib/auth/authority";
import { can, requirePermission } from "@/lib/auth/guard";
import { syncCandidateAndUsers } from "@/lib/ats/sync";
import { db } from "@/lib/db";

export const metadata = { title: "People" };

export default async function AdminPeoplePage() {
  const context = await requirePermission("user.view");

  // Sync any non-global candidates into Users table
  await syncCandidateAndUsers();

  const [users, roles, permissions] = await Promise.all([
    // Overrides are per-person exceptions to the role matrix. The guard has
    // always honoured them; nothing could create one until now.
    db.user.findMany({
      include: { role: true, overrides: { include: { permission: true } } },
      orderBy: [{ role: { rank: "asc" } }, { name: "asc" }],
    }),
    db.role.findMany({ orderBy: { rank: "asc" } }),
    db.permission.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
  ]);

  const mayEdit = can(context, "user.manage");
  const mayOverride = can(context, "rbac.manage");
  const today = new Date().toISOString().slice(0, 10);

  // Authority is resolved on the SERVER for each row. The table is a dumb
  // renderer — every action it offers is independently re-checked by its API.
  const people: PersonRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    jobTitle: user.jobTitle ?? "",
    techStack: user.techStack ?? "",
    roleId: user.roleId,
    roleLabel: user.role.label,
    status: user.status,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
    mustChangePassword: user.mustChangePassword,
    canResend: mayEdit && user.mustChangePassword && canAdminister(context, { id: user.id, role: user.role }).ok,
    // Each action is gated on the permission its own endpoint checks, so
    // granting user.deactivate or user.delete alone actually does something.
    // Editing yourself is allowed for identity fields only; the role select is
    // disabled for your own row and the API refuses a self role change anyway.
    canEdit: mayEdit && canEditIdentity(context, { id: user.id, role: user.role }).ok,
    canDeactivate: can(context, "user.deactivate") && user.id !== context.user.id && canAdminister(context, { id: user.id, role: user.role }).ok,
    canRemove: can(context, "user.delete") && user.id !== context.user.id && canAdminister(context, { id: user.id, role: user.role }).ok,
    // The export route allows viewing your own record, hence no self exclusion.
    canExport: can(context, "user.view") && (user.id === context.user.id || canAdminister(context, { id: user.id, role: user.role }).ok),
    isSelf: user.id === context.user.id,
    canOverride: mayOverride && user.id !== context.user.id && canAdminister(context, { id: user.id, role: user.role }).ok,
    overrides: user.overrides.map((o) => ({
      key: o.permission.key,
      label: o.permission.label,
      effect: o.effect,
      reason: o.reason ?? "",
      expiresAt: o.expiresAt ? o.expiresAt.toISOString().slice(0, 10) : "",
      expired: o.expiresAt ? o.expiresAt.getTime() < Date.now() : false,
    })),
  }));

  const roleOptions = roles.map((role) => ({
    id: role.id,
    label: role.label,
    assignable: canAssignRole(context, role).ok,
  }));

  return <section className="portal-section">
    <h2 className="portal-section-title">People</h2>
    <p className="portal-note">
      {users.length} account{users.length === 1 ? "" : "s"} in the workspace. {describeAuthority(context)}
    </p>

    <PeopleTable
      people={people}
      roles={roleOptions}
      // Same permission as editing — user.manage is described as "Create
      // accounts and edit their details". Whether any given role can actually
      // be assigned is decided per role by canAssignRole below.
      canCreate={mayEdit && roleOptions.some((role) => role.assignable)}
      permissions={permissions.map((p) => ({ key: p.key, label: p.label, group: p.group }))}
      today={today}
    />
  </section>;
}
