import { PeopleTable, type PersonRow } from "@/components/admin/people-table";
import { RoleManager, type RoleRow } from "@/components/admin/role-manager";
import { canAdminister, canAssignRole, canEditIdentity, describeAuthority } from "@/lib/auth/authority";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "People" };

export default async function AdminPeoplePage() {
  const context = await requirePermission("user.view");

  const [users, roles, permissions] = await Promise.all([
    // Overrides are per-person exceptions to the role matrix. The guard has
    // always honoured them; nothing could create one until now.
    db.user.findMany({
      include: { role: true, overrides: { include: { permission: true } } },
      orderBy: [{ role: { rank: "asc" } }, { name: "asc" }],
    }),
    db.role.findMany({ orderBy: { rank: "asc" }, include: { _count: { select: { users: true } } } }),
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
    // Developer is assigned by the Candidate Pool, so People leaves it out of
    // the role dropdown. Both user endpoints re-check this; the flag is carried
    // here only so the dialogs know what to omit.
    viaCandidatePool: role.viaCandidatePool,
  }));

  // Same server-resolved-authority pattern as the people rows above: the role
  // table is a dumb renderer and every action it offers is re-checked by its
  // own endpoint.
  const mayEditRole = (role: (typeof roles)[number]) =>
    mayOverride && !role.isSuperAdmin && (context.role.isSuperAdmin || role.rank > context.role.rank);

  const roleRows: RoleRow[] = roles.map((role) => ({
    id: role.id,
    key: role.key,
    label: role.label,
    description: role.description ?? "",
    rank: role.rank,
    isSystem: role.isSystem,
    isSuperAdmin: role.isSuperAdmin,
    viaCandidatePool: role.viaCandidatePool,
    userCount: role._count.users,
    canEdit: mayEditRole(role),
    // Built-in roles are permanent — CEO & Founder, Co-Founder and Developer.
    // Developer in particular is what the Candidate Pool assigns, so deleting it
    // would leave staff onboarding with no role to hand out. Only roles created
    // here can be deleted, and only once nobody holds them.
    canDelete: mayEditRole(role) && !role.isSystem && role._count.users === 0,
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
      canCreate={mayEdit && roleOptions.some((role) => role.assignable && !role.viaCandidatePool)}
      permissions={permissions.map((p) => ({ key: p.key, label: p.label, group: p.group }))}
      today={today}
    />

    {mayOverride && <div className="mt-10">
      <h2 className="portal-section-title">Roles</h2>
      <RoleManager roles={roleRows} />
    </div>}
  </section>;
}
