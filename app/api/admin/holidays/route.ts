import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type HolidayErrors = Partial<Record<"date" | "name", string>>;

/**
 * Public holidays, which lib/leave/leave.ts excludes when counting leave days.
 *
 * Until now the only way to add one was editing prisma/seed-holidays.ts and
 * running it — despite that script's own comment saying HR adds the movable
 * feasts each year. `leave.manage` gates this because whoever administers leave
 * is who needs it.
 *
 * Note `Holiday.date` is unique on its own, so a date can only exist once
 * regardless of region; upsert-by-date is therefore the honest semantic.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("leave.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const date = String(input.date ?? "").trim();
  const name = String(input.name ?? "").trim().slice(0, 200);

  const errors: HolidayErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Please choose a date.";
  if (name.length < 2) errors.name = "Please name the holiday.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const when = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(when.getTime())) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { date: "That is not a real date." } }, { status: 422 });

  const existing = await db.holiday.findUnique({ where: { date: when } });
  if (existing) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { date: `${existing.name} is already recorded on that date.` } }, { status: 422 });
  }

  const holiday = await db.holiday.create({ data: { date: when, name } });
  await recordAudit({
    actorId: context.user.id, action: "holiday.create", entityType: "Holiday", entityId: holiday.id,
    after: { date, name }, ipAddress: clientIp(request),
  });

  return NextResponse.json({ message: `${name} added.` });
}

/** Remove a holiday, so a date reverts to being a normal working day. */
export async function DELETE(request: Request) {
  const { context, response } = await guardRoute("leave.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const id = String((body as Record<string, unknown>)?.id ?? "").trim();
  if (!id) return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 });

  const holiday = await db.holiday.findUnique({ where: { id } });
  if (!holiday) return NextResponse.json({ message: "That holiday no longer exists." }, { status: 404 });

  await db.holiday.delete({ where: { id } });
  await recordAudit({
    actorId: context.user.id, action: "holiday.delete", entityType: "Holiday", entityId: id,
    before: { date: holiday.date.toISOString().slice(0, 10), name: holiday.name }, ipAddress: clientIp(request),
  });

  // Leave already approved keeps the day count it was granted with — those are
  // frozen at submission (LeaveRequest.days), so this only affects new requests.
  return NextResponse.json({ message: `${holiday.name} removed.` });
}
