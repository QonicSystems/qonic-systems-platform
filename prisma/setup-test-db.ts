import "dotenv/config";
import { execFileSync } from "node:child_process";

/**
 * Prepares the disposable database used by the Playwright suite: applies
 * migrations, seeds roles/permissions/CEO, then adds one demo account per role.
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
  BOOTSTRAP_CEO_EMAIL: process.env.BOOTSTRAP_CEO_EMAIL ?? "founder@avenstrixconsulting.com",
  BOOTSTRAP_CEO_NAME: process.env.BOOTSTRAP_CEO_NAME ?? "Test Founder",
  BOOTSTRAP_CEO_PASSWORD: process.env.BOOTSTRAP_CEO_PASSWORD ?? "Test-Bootstrap-Pw-2026",
};

const run = (command: string, args: string[]) => execFileSync(command, args, { env, stdio: "inherit" });

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["tsx", "prisma/seed.ts"]);
run("npx", ["tsx", "prisma/seed-demo.ts"]);
console.log("\n✔ Test database ready.");
