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

const FOUNDER_NAME = "Avinash Singh";
const FOUNDER_EMAIL = "avinash.singh@qonicsystems.com";
const FOUNDER_PASSWORD = "admin";

const LEAVE_TYPES = [
  { key: "annual", label: "Annual Leave", description: "Paid time off.", annualDays: 24, tracksBalance: true, colour: "#0e9384", sortOrder: 10 },
  { key: "sick", label: "Sick Leave", description: "Paid leave for illness.", annualDays: 12, tracksBalance: true, colour: "#c2a878", sortOrder: 20 },
  { key: "casual", label: "Casual Leave", description: "Short-notice personal leave.", annualDays: 8, tracksBalance: true, colour: "#7c3aed", sortOrder: 30 },
  { key: "unpaid", label: "Unpaid Leave", description: "Leave without pay. Not capped.", annualDays: 0, tracksBalance: false, colour: "#8a93a0", sortOrder: 40 },
];

async function main() {
  console.log("🧹 Wiping all existing local database tables...");

  // Execute raw CASCADE truncate across all tables
  const tablenames = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';
  `;

  for (const { tablename } of tablenames) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
  }
  console.log("✔ All local tables wiped cleanly.");

  console.log("🌱 Seeding roles & permissions...");
  for (const role of SEEDED_ROLES) {
    await db.role.create({
      data: {
        key: role.key,
        label: role.label,
        description: role.description,
        isSuperAdmin: role.isSuperAdmin,
        isSystem: true,
        rank: role.rank,
      },
    });
  }
  console.log(`✔ ${SEEDED_ROLES.length} roles created`);

  for (const permission of PERMISSIONS) {
    await db.permission.create({
      data: { ...permission },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} permissions created`);

  const allPermissions = await db.permission.findMany();
  const roles = await db.role.findMany();

  for (const role of roles) {
    if (role.isSuperAdmin) continue;
    const defaults = new Set<string>(DEFAULT_ROLE_PERMISSIONS[role.key as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? []);

    for (const permission of allPermissions) {
      await db.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
          enabled: defaults.has(permission.key),
        },
      });
    }
  }
  console.log("✔ Role-permission matrix created");

  for (const type of LEAVE_TYPES) {
    await db.leaveType.create({ data: type });
  }
  console.log(`✔ ${LEAVE_TYPES.length} leave types created`);

  console.log("👤 Creating founder account...");
  const ceoRole = await db.role.findUniqueOrThrow({ where: { key: ROLE.CEO } });
  const passwordHash = await hashPassword(FOUNDER_PASSWORD);

  const founder = await db.user.create({
    data: {
      email: FOUNDER_EMAIL,
      name: FOUNDER_NAME,
      passwordHash,
      roleId: ceoRole.id,
      ceoSingletonKey: ceoSingletonValue(ceoRole.key),
      jobTitle: "Founder & CEO",
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });

  console.log("\n========================================================");
  console.log(`🎉 Database reset & reseeded successfully!`);
  console.log(`👤 Founder Name:     ${founder.name}`);
  console.log(`📧 Founder Email:    ${founder.email}`);
  console.log(`🔑 Founder Password: ${FOUNDER_PASSWORD}`);
  console.log(`👑 Role:             CEO (Super Admin)`);
  console.log("========================================================\n");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error("Error resetting database:", err);
    await db.$disconnect();
    process.exit(1);
  });
