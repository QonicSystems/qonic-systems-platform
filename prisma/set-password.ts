import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeDatabaseUrl } from "../lib/database-url";
import { describePasswordProblem, hashPassword } from "../lib/auth/password";

/**
 * Administrator recovery: set an account's password from the command line.
 *
 *   npm run db:set-password -- founder@qonicsystems.com
 *   npm run db:set-password -- founder@qonicsystems.com "My-Own-Passw0rd"
 *
 * This exists because there is otherwise no way back in when the super admin
 * forgets their password: the admin console needs a login, and the emailed reset
 * needs SMTP configured. Note that BOOTSTRAP_CEO_PASSWORD only applies while the
 * user table is empty — changing it later has no effect.
 *
 * Requires shell access to the server, which is the intended bar for this.
 */
async function main() {
  const [email, provided] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npm run db:set-password -- <email> [password]");

  // Generated passwords are printed once and never stored anywhere else.
  const password = provided ?? `${randomBytes(9).toString("base64url")}-Av1`;
  const problem = describePasswordProblem(password);
  if (problem) throw new Error(`Refusing to set that password: ${problem}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeDatabaseUrl(connectionString) }) });

  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { role: true } });
  if (!user) throw new Error(`No account found for ${email}`);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        // Clear any lockout, and reactivate — this is a recovery tool, so an
        // account that was suspended by mistake should come back cleanly.
        failedLoginCount: 0,
        lockedUntil: null,
        status: "ACTIVE",
        // Only force a change when WE generated the password. If an administrator
        // chose one deliberately, respect it.
        mustChangePassword: provided === undefined,
      },
    });
    // Any session opened with the old password is no longer trustworthy.
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: { actorId: null, action: "auth.password.admin_reset", entityType: "User", entityId: user.id, after: { email: user.email, via: "cli" } },
    });
  });

  console.log(`\n✔ Password set for ${user.name} <${user.email}> (${user.role.label})`);
  console.log(`  Password: ${password}`);
  if (provided === undefined) console.log("  They will be asked to choose their own password at first sign-in.");
  console.log("  All existing sessions for this account were signed out.\n");

  await db.$disconnect();
}

main().catch((error) => {
  console.error(`\n✘ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
