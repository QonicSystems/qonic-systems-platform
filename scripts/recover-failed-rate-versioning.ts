import { spawnSync } from "node:child_process";

const migrationName = "20260821230000_rate_versioning";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function runPrisma(args: string[]) {
  return spawnSync(npx, ["prisma", ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

const status = runPrisma(["migrate", "status"]);
const statusOutput = `${status.stdout ?? ""}${status.stderr ?? ""}`;

if (status.status === 0) {
  process.stdout.write(statusOutput);
  process.exit(0);
}

const isKnownFailedMigration =
  statusOutput.includes("P3009") && statusOutput.includes(migrationName);

if (isKnownFailedMigration) {
  console.warn(`Recovering failed migration ${migrationName} so its corrected SQL can be applied.`);
  const recovery = runPrisma(["migrate", "resolve", "--rolled-back", migrationName]);
  process.stdout.write(`${recovery.stdout ?? ""}${recovery.stderr ?? ""}`);
  process.exit(recovery.status ?? 1);
}

// `migrate status` uses a non-zero exit code when migrations are pending. That is
// expected during a deployment: the following `migrate deploy` command applies them.
const hasPendingMigrations = statusOutput.includes("Following migrations have not yet been applied:");

if (hasPendingMigrations) {
  process.stdout.write(statusOutput);
  process.exit(0);
}

process.stderr.write(statusOutput);
process.exit(status.status ?? 1);
