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

function resolveKnownMigration() {
  console.warn(`Checking failed migration recovery for ${migrationName}.`);
  const recovery = runPrisma(["migrate", "resolve", "--rolled-back", migrationName]);
  const recoveryOutput = `${recovery.stdout ?? ""}${recovery.stderr ?? ""}`;

  if (recovery.status === 0) {
    process.stdout.write(recoveryOutput);
    process.exit(0);
  }

  // On a database where this migration is already healthy, Prisma rejects a
  // rollback resolution. The deployment can safely continue to migrate deploy.
  const isAlreadyHealthy = recoveryOutput.includes("P3008") || recoveryOutput.includes("P3011");
  if (isAlreadyHealthy) {
    console.warn(`Migration ${migrationName} is not failed; continuing to migrate deploy.`);
    process.exit(0);
  }

  process.stderr.write(recoveryOutput);
  process.exit(recovery.status ?? 1);
}

if (status.status === 0) {
  process.stdout.write(statusOutput);
  process.exit(0);
}

const isKnownFailedMigration =
  statusOutput.includes("P3009") && statusOutput.includes(migrationName);

if (isKnownFailedMigration) {
  resolveKnownMigration();
}

// `migrate status` uses a non-zero exit code when migrations are pending. That is
// expected during a deployment: the following `migrate deploy` command applies them.
const hasPendingMigrations = statusOutput.includes("Following migrations have not yet been applied:");

if (hasPendingMigrations) {
  // In some Prisma versions `migrate status` omits a failed migration and only
  // reports the migrations after it as pending. The target's absence identifies
  // that case without interfering with a fresh database where it is pending.
  if (!statusOutput.includes(migrationName)) {
    resolveKnownMigration();
  }

  process.stdout.write(statusOutput);
  process.exit(0);
}

process.stderr.write(statusOutput);
process.exit(status.status ?? 1);
