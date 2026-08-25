import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeDatabaseUrl } from "../lib/database-url";
import { describePasswordProblem, hashPassword } from "../lib/auth/password";
import { emailPattern } from "../lib/contact";
import { CEO_ALREADY_ASSIGNED_MESSAGE, CEO_SINGLETON_KEY, ceoSingletonValue } from "../lib/auth/single-ceo";

/**
 * Create a colleague's account from the command line.
 *
 *   npm run db:add-user -- anusha.kherwal@qonicsystems.com "Anusha Kherwal" co_founder
 *   npm run db:add-user -- someone@qonicsystems.com "Their Name" employee "Their-Passw0rd"
 *
 * This exists because the application has no way to add a person at all: the
 * admin console can edit, deactivate and remove accounts but never create one,
 * and prisma/seed.ts only creates the CEO while the user table is empty. Until
 * an invite flow exists, this is the only route.
 *
 * The account is always forced to choose its own password at first login, so a
 * password typed here is a handover value and not a lasting credential.
 */
async function main() {
  const [email, name, roleKey, provided] = process.argv.slice(2);
  if (!email || !name || !roleKey) {
    throw new Error('Usage: npm run db:add-user -- <email> "<full name>" <role-key> [password]');
  }

  const address = email.trim().toLowerCase();
  if (!emailPattern.test(address)) throw new Error(`"${address}" is not a valid email address.`);
  if (name.trim().length < 2) throw new Error("Please give a full name.");

  // Printed once and stored only as an argon2 hash.
  const password = provided ?? `${randomBytes(9).toString("base64url")}-Av1`;
  const problem = describePasswordProblem(password);
  if (problem) throw new Error(`Refusing to set that password: ${problem}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeDatabaseUrl(connectionString) }) });
  try {
    const clash = await db.user.findUnique({ where: { email: address } });
    if (clash) throw new Error(`${address} already exists — use db:set-password or db:set-email instead.`);

    const role = await db.role.findUnique({ where: { key: roleKey.trim() } });
    if (!role) {
      const available = await db.role.findMany({ select: { key: true, label: true }, orderBy: { rank: "asc" } });
      throw new Error(`No role "${roleKey}". Available: ${available.map((r) => `${r.key} (${r.label})`).join(", ")}`);
    }

    if (ceoSingletonValue(role.key) && await db.user.findUnique({ where: { ceoSingletonKey: CEO_SINGLETON_KEY }, select: { id: true } })) {
      throw new Error(CEO_ALREADY_ASSIGNED_MESSAGE);
    }

    const user = await db.user.create({
      data: {
        email: address, name: name.trim(), passwordHash: await hashPassword(password),
        roleId: role.id, status: "ACTIVE", mustChangePassword: true,
        ceoSingletonKey: ceoSingletonValue(role.key),
      },
    });

    await db.auditLog.create({
      data: { actorId: user.id, action: "user.create", entityType: "User", entityId: user.id, after: { email: address, name: name.trim(), role: role.key } },
    });

    console.log(`✔ Created ${user.name} <${user.email}> as ${role.label}`);
    if (!provided) console.log(`  Temporary password: ${password}`);
    console.log("  They must set their own password at first sign-in.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(`✘ ${(error as Error).message}`); process.exit(1); });
