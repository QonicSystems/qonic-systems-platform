import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/auth/password";
import { ROLE } from "../lib/auth/roles";

/**
 * Demo/test accounts — one per role, with known passwords.
 *
 * Development and test only. It refuses to run against NODE_ENV=production so
 * these predictable credentials can never reach a real deployment.
 */
const DEMO_PASSWORD = "Demo-Passw0rd-2026";

const PEOPLE = [
  { email: "cofounder@qonicsystems.com", name: "Priya Raman", role: ROLE.CO_FOUNDER, jobTitle: "Co-Founder" },
  { email: "hr@qonicsystems.com", name: "Neha Kulkarni", role: ROLE.HR, jobTitle: "Head of People" },
  { email: "accounts@qonicsystems.com", name: "Rahul Mehta", role: ROLE.ACCOUNTS, jobTitle: "Finance Manager" },
  { email: "projects@qonicsystems.com", name: "Sana Iqbal", role: ROLE.PROJECTS, jobTitle: "Delivery Lead" },
  { email: "developer@qonicsystems.com", name: "Arjun Nair", role: ROLE.EMPLOYEE, jobTitle: "Senior Developer" },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo accounts in production.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const person of PEOPLE) {
    const role = await db.role.findUniqueOrThrow({ where: { key: person.role } });
    await db.user.upsert({
      where: { email: person.email },
      update: { roleId: role.id, jobTitle: person.jobTitle },
      // Demo users skip the forced password change so tests can sign straight in.
      create: { email: person.email, name: person.name, passwordHash, roleId: role.id, jobTitle: person.jobTitle, mustChangePassword: false },
    });
    console.log(`✔ ${person.email} (${role.label})`);
  }

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exit(1); });
