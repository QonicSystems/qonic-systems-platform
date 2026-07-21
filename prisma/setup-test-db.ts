import "dotenv/config";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * Prepares the disposable database used by the Playwright suite: applies
 * migrations, clears existing data, then seeds roles, permissions, and one demo
 * account per role.
 *
 * Run before `npm run test:e2e` the first time, or after a schema change.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set — add it to .env (see .env.example).");
if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL; this database gets seeded with known passwords.");

const env = {
  ...process.env,
  DATABASE_URL: url,
  // The bootstrap CEO is never used by the e2e suite, but the seed requires it.
  BOOTSTRAP_CEO_EMAIL: process.env.BOOTSTRAP_CEO_EMAIL ?? "founder@qonicsystems.com",
  BOOTSTRAP_CEO_NAME: process.env.BOOTSTRAP_CEO_NAME ?? "Test Founder",
  BOOTSTRAP_CEO_PASSWORD: process.env.BOOTSTRAP_CEO_PASSWORD ?? "Test-Bootstrap-Pw-2026",
};

const run = (command: string, args: string[]) => execFileSync(command, args, { env, stdio: "inherit" });

/**
 * Empties the data tables, leaving the schema alone.
 *
 * Seeding on top of existing rows silently duplicates people whenever a seed
 * identifier changes: the demo seed upserts on EMAIL, so moving to a new domain
 * created a second row per person instead of updating the first, and the e2e
 * row selectors then matched two rows each.
 *
 * `prisma migrate reset` would also do this, but it drops and recreates the
 * whole schema — far more destructive than needed, and correctly gated behind a
 * consent prompt. TRUNCATE of the data tables is the narrower, safer tool.
 */
async function clearData() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  // CASCADE handles the foreign keys between these in one statement, so the
  // order below does not have to be dependency-perfect.
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "TimeEntry", "Timesheet", "ProjectAssignment", "ProjectTask", "ProjectMilestone",
    "InvoiceLine", "Payment", "CreditNote", "Invoice", "Expense",
    "Interview", "Placement", "ApplicationEvent", "Application", "Candidate", "Job",
    "Project", "ClientContact", "Client",
    "ContractLetterEvent", "ContractLetter",
    "LeaveRequest", "LeaveBalance",
    "Notification", "BankDetail", "PasswordResetToken", "Session",
    "UserPermissionOverride", "AuditLog", "User"
    RESTART IDENTITY CASCADE`);
  await db.$disconnect();
  console.log("✔ Test data cleared");
}

async function main() {
  run("npx", ["prisma", "migrate", "deploy"]);
  await clearData();
  run("npx", ["tsx", "prisma/seed.ts"]);
  run("npx", ["tsx", "prisma/seed-demo.ts"]);
  console.log("\n✔ Test database ready.");
}

main().catch((error) => { console.error(error); process.exit(1); });
