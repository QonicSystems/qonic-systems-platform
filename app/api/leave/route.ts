import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { validateLeaveInput } from "@/lib/leave/leave";
import { notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Submit a leave request for yourself. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("leave.request");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  // Load the calendar once and hand it to the validator, which stays pure.
  const holidayRows = await db.holiday.findMany({ select: { date: true } });
  const holidays = new Set(holidayRows.map((row) => row.date.toISOString().slice(0, 10)));

  const { data, errors } = validateLeaveInput(body, holidays);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const leaveType = await db.leaveType.findUnique({ where: { id: data.leaveTypeId } });
  if (!leaveType || !leaveType.isActive) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { leaveTypeId: "That leave type is not available." } }, { status: 422 });
  }

  // Overlapping requests would double-count the same days against a balance.
  const clash = await db.leaveRequest.findFirst({
    where: {
      userId: context.user.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: data.end },
      endDate: { gte: data.start },
    },
  });
  if (clash) {
    return NextResponse.json({ message: "You already have leave booked that overlaps those dates." }, { status: 409 });
  }

  const year = data.start.getUTCFullYear();
  if (leaveType.tracksBalance) {
    const balance = await db.leaveBalance.findUnique({
      where: { userId_leaveTypeId_year: { userId: context.user.id, leaveTypeId: leaveType.id, year } },
    });
    const entitled = balance?.entitledDays ?? leaveType.annualDays;
    const used = balance?.usedDays ?? 0;
    if (data.days > entitled - used) {
      return NextResponse.json({
        message: `That request is ${data.days} day${data.days === 1 ? "" : "s"} but you have only ${entitled - used} left of your ${leaveType.label} allowance.`,
      }, { status: 409 });
    }
  }

  const created = await db.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        userId: context.user.id, leaveTypeId: leaveType.id,
        startDate: data.start, endDate: data.end, days: data.days,
        reason: data.reason || null, status: "PENDING",
      },
    });
    await notifyLeadership({
      kind: "LEAVE",
      title: `Leave Requested: ${context.user.name}`,
      body: `${context.user.name} requested ${data.days} day(s) of ${leaveType.label} (${data.startDate} to ${data.endDate}).`,
      link: `/leave`,
    }, tx);
    await recordAudit({
      actorId: context.user.id, action: "leave.request", entityType: "LeaveRequest", entityId: leave.id,
      after: { type: leaveType.key, days: data.days, from: data.startDate, to: data.endDate }, ipAddress: clientIp(request),
    }, tx);
    return leave;
  });

  return NextResponse.json({ message: `Requested ${data.days} day${data.days === 1 ? "" : "s"} of ${leaveType.label}.`, id: created.id });
}
