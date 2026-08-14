import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { emailPattern } from "../lib/contact";

/**
 * Administrator recovery: change an account's email from the command line.
 *
 *   npm run db:set-email -- old@example.com new@example.com
 *
 * The companion to db:set-password, and it exists for the same reason: the
 * super admin can be locked out of a change only they should be able to make.
 * Self-service profile deliberately treats email as an identity rather than a
 * detail, and the admin console refuses self-edits so nobody can escalate their
 * own role — which together leave a sole super admin with no route to rename
 * themselves. The UI now allows this (see canAdminister), but this stays as the
 * recovery path when nobody can sign in at all.
 *
 * Requires the database URL, which is the intended bar for this.
 */
async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("Usage: npm run db:set-email -- <current-email> <new-email>");

  const current = from.trim().toLowerCase();
  const next = to.trim().toLowerCase();
  if (!emailPattern.test(next)) throw new Error(`"${next}" is not a valid email address.`);
  if (current === next) throw new Error("The new address is the same as the current one.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await db.user.findUnique({ where: { email: current }, include: { role: { select: { label: true } } } });
    if (!user) throw new Error(`No account found for ${current}.`);

    // The column is unique, so this would fail anyway — caught here to give a
    // usable message rather than a constraint violation.
    const clash = await db.user.findUnique({ where: { email: next } });
    if (clash) throw new Error(`${next} is already used by another account.`);

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { email: next } });
      await tx.auditLog.create({
        data: {
          actorId: user.id, action: "user.email.change", entityType: "User", entityId: user.id,
          before: { email: current }, after: { email: next },
        },
      });
    });

    console.log(`✔ ${user.name} (${user.role.label}) is now ${next}`);
    console.log("  Existing sessions stay valid — the account id did not change.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(`✘ ${(error as Error).message}`); process.exit(1); });
