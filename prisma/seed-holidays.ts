import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/** Fixed-date national holidays. Movable feasts are added by HR each year. */
const HOLIDAYS_2026 = [
  ["2026-01-01", "New Year's Day"],
  ["2026-01-26", "Republic Day"],
  ["2026-03-04", "Holi"],
  ["2026-04-03", "Good Friday"],
  ["2026-05-01", "Labour Day"],
  ["2026-08-15", "Independence Day"],
  ["2026-10-02", "Gandhi Jayanti"],
  ["2026-11-08", "Diwali"],
  ["2026-12-25", "Christmas Day"],
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  for (const [date, name] of HOLIDAYS_2026) {
    await db.holiday.upsert({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      update: { name },
      create: { date: new Date(`${date}T00:00:00.000Z`), name, region: "IN" },
    });
  }
  console.log(`✔ ${HOLIDAYS_2026.length} public holidays seeded for 2026`);
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exit(1); });
