import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { getIndianPublicHolidays } from "@/lib/holidays/indian-holidays";

export const runtime = "nodejs";

/**
 * Pull and sync Indian Public Holidays in real time.
 * Gated by `leave.manage`.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("leave.manage");
  if (response) return response;

  try {
    const currentYear = new Date().getFullYear();
    const holidays = await getIndianPublicHolidays([currentYear - 1, currentYear, currentYear + 1]);

    let synced = 0;
    for (const holiday of holidays) {
      const when = new Date(`${holiday.date}T00:00:00.000Z`);
      await db.holiday.upsert({
        where: { date: when },
        update: { name: holiday.name, region: holiday.region },
        create: { date: when, name: holiday.name, region: holiday.region },
      });
      synced += 1;
    }

    await recordAudit({
      actorId: context.user.id,
      action: "holiday.sync",
      entityType: "Holiday",
      entityId: null,
      after: { total: synced, region: "IN" },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({
      message: `Successfully synced ${synced} Indian Public Holidays in real time.`,
      count: synced,
    });
  } catch (error) {
    console.error("Failed to sync holidays:", error);
    return NextResponse.json({ message: "Failed to sync public holidays." }, { status: 500 });
  }
}
