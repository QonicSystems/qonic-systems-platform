import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { getIndianPublicHolidays } from "../lib/holidays/indian-holidays";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log("🇮🇳 Pulling Indian Public Holidays in real time...");
  const holidays = await getIndianPublicHolidays([2025, 2026, 2027]);

  let added = 0;
  let updated = 0;

  for (const holiday of holidays) {
    const when = new Date(`${holiday.date}T00:00:00.000Z`);
    const existing = await db.holiday.findUnique({ where: { date: when } });
    if (existing) {
      await db.holiday.update({
        where: { date: when },
        data: { name: holiday.name, region: holiday.region },
      });
      updated += 1;
    } else {
      await db.holiday.create({
        data: { date: when, name: holiday.name, region: holiday.region },
      });
      added += 1;
    }
  }

  console.log(`\n✔ Successfully synced Indian Public Holidays:`);
  console.log(`  Total Holidays Processed: ${holidays.length}`);
  console.log(`  Added: ${added}`);
  console.log(`  Updated: ${updated}`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
