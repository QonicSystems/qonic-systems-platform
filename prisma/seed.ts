import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeDatabaseUrl } from "../lib/database-url";
import { hashPassword } from "../lib/auth/password";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../lib/auth/permissions";
import { ROLE, SEEDED_ROLES } from "../lib/auth/roles";
import { ceoSingletonValue } from "../lib/auth/single-ceo";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeDatabaseUrl(connectionString) }) });

/**
 * Idempotent: safe to run on every deploy.
 *
 * Roles and the permission catalog are upserted. Existing role→permission
 * toggles are NEVER overwritten — once the CEO has customised who can do what,
 * a redeploy must not silently reset their choices. Only missing rows are added,
 * using the defaults as the initial value.
 */
async function main() {
  for (const role of SEEDED_ROLES) {
    await db.role.upsert({
      where: { key: role.key },
      // `label`/`description` are CEO-editable, so only sync the structural fields.
      update: { isSuperAdmin: role.isSuperAdmin, isSystem: true, rank: role.rank, viaCandidatePool: role.viaCandidatePool },
      create: { key: role.key, label: role.label, description: role.description, isSuperAdmin: role.isSuperAdmin, isSystem: true, rank: role.rank, viaCandidatePool: role.viaCandidatePool },
    });
  }
  console.log(`✔ ${SEEDED_ROLES.length} roles`);

  // `viaCandidatePool` is seed-owned, not a per-role switch: only Developer
  // carries it. It was briefly settable when creating a role, which is how a
  // custom role could claim it — and a custom role holding that flag both
  // disappeared from Administration → People and became what the Candidate Pool
  // handed out. Anything else claiming it is corrected here.
  const strays = await db.role.updateMany({
    where: { viaCandidatePool: true, key: { notIn: SEEDED_ROLES.filter((r) => r.viaCandidatePool).map((r) => r.key) } },
    data: { viaCandidatePool: false },
  });
  if (strays.count > 0) console.log(`✔ ${strays.count} role(s) cleared of the Candidate Pool flag`);

  for (const permission of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: permission.key },
      update: { group: permission.group, label: permission.label, description: permission.description, sortOrder: permission.sortOrder },
      create: { ...permission },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} permissions`);

  // Before the backfill below, so it never recreates toggles for a permission
  // that is about to be deleted.
  await pruneRetiredPermissions();

  const allPermissions = await db.permission.findMany();
  const roles = await db.role.findMany();
  let created = 0;

  for (const role of roles) {
    // The super admin bypasses permission checks entirely, so seeding rows for
    // them would imply their access is toggleable. It is not.
    if (role.isSuperAdmin) continue;
    const defaults = new Set<string>(DEFAULT_ROLE_PERMISSIONS[role.key as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? []);

    for (const permission of allPermissions) {
      const existing = await db.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
      if (existing) continue; // Respect the CEO's runtime choices.
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id, enabled: defaults.has(permission.key) } });
      created += 1;
    }
  }
  console.log(`✔ ${created} role→permission rows created (existing toggles left untouched)`);

  await pruneRetiredRoles();
  await restoreErasedIdentities();
  await seedLeaveTypes();
  await bootstrapCeo();
}

/**
 * Deletes permissions the code-owned catalog no longer defines.
 *
 * Permissions were only ever upserted, so removing a key from PERMISSIONS left a
 * live row behind — and the admin console renders its matrix from real rows, so
 * a retired capability kept appearing as a switch that grants nothing, because
 * nothing checks it any more. Same reasoning as pruneRetiredRoles below.
 *
 * RolePermission and UserPermissionOverride both declare `onDelete: Cascade` on
 * permissionId, so no toggle or per-person exception is left dangling.
 */
async function pruneRetiredPermissions() {
  const current = PERMISSIONS.map((permission) => permission.key);
  const retired = await db.permission.findMany({ where: { key: { notIn: current } }, select: { key: true } });
  if (retired.length === 0) return;

  await db.permission.deleteMany({ where: { key: { notIn: current } } });
  console.log(`✔ ${retired.length} retired permission(s) removed: ${retired.map((p) => p.key).join(", ")}`);
}

/**
 * Deletes system roles the code no longer defines.
 *
 * Roles were only ever upserted, so the HR / Accounts / Projects rows seeded
 * before the platform refactor stayed in every database that had run the old
 * seed — which is why a deployed environment showed four extra columns in the
 * permission matrix that a freshly seeded one did not.
 *
 * Roles created by hand through the admin console are `isSystem: false` and are
 * never touched. Anyone still holding a retired role is moved to a surviving one
 * first, so the delete can never orphan an account.
 */
async function pruneRetiredRoles() {
  const current = new Set<string>(SEEDED_ROLES.map((role) => role.key));
  const retired = (await db.role.findMany({ where: { isSystem: true } })).filter(
    (role) => !current.has(role.key)
  );
  if (retired.length === 0) return;

  const retiredIds = new Set(retired.map((role) => role.id));

  // Developer by preference. The fallback is belt-and-braces: Developer is a
  // protected built-in and the upsert above has just re-created it, but this
  // runs unattended at deploy time and must not take a deploy down if the row
  // is somehow missing.
  const fallback =
    (await db.role.findUnique({ where: { key: ROLE.DEVELOPER } }))
    ?? (await db.role.findFirst({
      where: { isSuperAdmin: false, id: { notIn: [...retiredIds] } },
      orderBy: { rank: "desc" },
    }));

  const removed: string[] = [];
  for (const role of retired) {
    const holders = await db.user.count({ where: { roleId: role.id } });
    if (holders > 0) {
      if (!fallback) {
        // Deleting would violate User.roleId. Leaving the role in place is the
        // lesser evil: an extra column in the permission matrix beats a failed
        // deploy or an orphaned account.
        console.log(`  ! kept retired role "${role.key}": ${holders} account(s) hold it and there is no other role to move them to`);
        continue;
      }
      await db.user.updateMany({ where: { roleId: role.id }, data: { roleId: fallback.id } });
      console.log(`  → moved ${holders} account(s) from retired role "${role.key}" to ${fallback.label}`);
    }
    // RolePermission and UserPermissionOverride rows cascade with the role.
    await db.role.delete({ where: { id: role.id } });
    removed.push(role.key);
  }
  if (removed.length > 0) console.log(`✔ ${removed.length} retired role(s) removed: ${removed.join(", ")}`);
}

/**
 * Puts real names back on accounts the removed "erase personal data" action had
 * anonymised to "Erased User".
 *
 * Archiving exists to keep a readable record of who someone was; overwriting the
 * name defeated that. The original name and email were captured in the audit log
 * at the time, so they can be restored — the account stays ARCHIVED either way.
 */
async function restoreErasedIdentities() {
  const anonymised = await db.user.findMany({
    where: { OR: [{ email: { endsWith: "@erased.invalid" } }, { name: "Erased User" }] },
    select: { id: true, name: true, email: true },
  });
  if (anonymised.length === 0) return;

  let restored = 0;
  for (const user of anonymised) {
    const entry = await db.auditLog.findFirst({
      where: { action: "gdpr.erase", entityType: "User", entityId: user.id },
      orderBy: { createdAt: "desc" },
      select: { before: true },
    });

    const before = entry?.before as { name?: unknown; email?: unknown } | null;
    const name = typeof before?.name === "string" ? before.name.trim() : "";
    const email = typeof before?.email === "string" ? before.email.trim().toLowerCase() : "";
    if (!name || !email) {
      console.log(`  • ${user.email}: no pre-erasure record in the audit log — name cannot be recovered`);
      continue;
    }

    // Someone may have re-created the account under the same address since.
    const clash = await db.user.findUnique({ where: { email } });
    if (clash && clash.id !== user.id) {
      await db.user.update({ where: { id: user.id }, data: { name } });
      console.log(`  • restored name for ${user.id} but kept ${user.email}: ${email} is in use`);
    } else {
      await db.user.update({ where: { id: user.id }, data: { name, email } });
    }
    restored += 1;
  }
  if (restored > 0) console.log(`✔ ${restored} anonymised account(s) restored to their real identity`);
}

/** Starting leave categories. More can be added later without a migration. */
const LEAVE_TYPES = [
  { key: "annual", label: "Annual Leave", description: "Paid time off.", annualDays: 24, tracksBalance: true, colour: "#0e9384", sortOrder: 10 },
  { key: "sick", label: "Sick Leave", description: "Paid leave for illness.", annualDays: 12, tracksBalance: true, colour: "#c2a878", sortOrder: 20 },
  { key: "casual", label: "Casual Leave", description: "Short-notice personal leave.", annualDays: 8, tracksBalance: true, colour: "#7c3aed", sortOrder: 30 },
  { key: "unpaid", label: "Unpaid Leave", description: "Leave without pay. Not capped.", annualDays: 0, tracksBalance: false, colour: "#8a93a0", sortOrder: 40 },
];

async function seedLeaveTypes() {
  for (const type of LEAVE_TYPES) {
    await db.leaveType.upsert({
      where: { key: type.key },
      // `annualDays` is deliberately NOT synced on update: once HR has adjusted an
      // allowance, a redeploy must not silently reset it.
      update: { label: type.label, description: type.description, colour: type.colour, sortOrder: type.sortOrder },
      create: type,
    });
  }
  console.log(`✔ ${LEAVE_TYPES.length} leave types`);
}

/**
 * Creates the first account only when there are no users at all. Never ships a
 * default password: the credentials come from the environment, and the account
 * is forced to change its password at first login.
 */
async function bootstrapCeo() {
  if ((await db.user.count()) > 0) {
    console.log("• Users already exist — skipping CEO bootstrap");
    return;
  }

  const email = process.env.BOOTSTRAP_CEO_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_CEO_NAME?.trim();
  const password = process.env.BOOTSTRAP_CEO_PASSWORD;

  if (!email || !name || !password) {
    throw new Error("Cannot bootstrap: set BOOTSTRAP_CEO_EMAIL, BOOTSTRAP_CEO_NAME and BOOTSTRAP_CEO_PASSWORD.");
  }
  if (password.length < 12) throw new Error("BOOTSTRAP_CEO_PASSWORD must be at least 12 characters.");

  const ceo = await db.role.findUniqueOrThrow({ where: { key: ROLE.CEO } });
  await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      roleId: ceo.id,
      ceoSingletonKey: ceoSingletonValue(ceo.key),
      jobTitle: "CEO & Founder",
      mustChangePassword: process.env.BOOTSTRAP_CEO_MUST_CHANGE === "true",
    },
  });
  console.log(`✔ CEO account created for ${email}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
