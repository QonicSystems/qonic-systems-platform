import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { weekStartOf } from "@/lib/delivery/timesheet";
import { isoDay, missingPreStartWorkdays } from "@/lib/finance/prestart-backfill";
import { notify, notifyMany } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Opens the unfiled pre-start weeks for one Developer–Project assignment.
 * No time is invented here: it merely ensures that the real missing weeks are
 * editable and asks the Developer to record what was actually worked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("report.finance");
  if (response) return response;
  if (context.role.key !== ROLE.CEO && context.role.key !== ROLE.CO_FOUNDER) {
    return NextResponse.json({ message: "Only the CEO or Co-Founder can reopen unfiled pre-start delivery time." }, { status: 403 });
  }

  const { id: projectId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const userId = typeof body === "object" && body !== null ? String((body as Record<string, unknown>).userId ?? "") : "";
  if (!userId) return NextResponse.json({ message: "Choose the Developer whose unfiled time should be reopened." }, { status: 422 });

  const assignment = await db.projectAssignment.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { name: true } }, project: { select: { name: true, startDate: true } } },
  });
  if (!assignment) return NextResponse.json({ message: "That Developer is not assigned to this project." }, { status: 404 });

  const [entries, sheets] = await Promise.all([
    db.timeEntry.findMany({
      where: { projectId, timesheet: { userId } },
      select: { workDate: true },
    }),
    db.timesheet.findMany({
      where: { userId },
      select: { id: true, weekStart: true, status: true, entries: { select: { invoiceId: true } } },
    }),
  ]);

  const sheetByWeek = new Map(sheets.map((sheet) => [isoDay(sheet.weekStart), sheet]));
  const missingDays = missingPreStartWorkdays({
    projectStart: assignment.project.startDate,
    actualStart: assignment.startedOn ?? assignment.createdAt,
    today: new Date(),
    recordedDays: new Set(entries.map((entry) => isoDay(entry.workDate))),
  });

  if (missingDays.length === 0) {
    return NextResponse.json({ message: "There are no unfiled pre-start working days to reopen for this assignment." }, { status: 409 });
  }

  const weeks = [...new Map(missingDays.map((day) => {
    const weekStart = weekStartOf(day);
    return [isoDay(weekStart), weekStart] as const;
  })).values()];
  const firstWeek = weeks[0]!;
  const invoicedWeek = weeks.find((weekStart) => {
    const sheet = sheetByWeek.get(isoDay(weekStart));
    return sheet?.status === "APPROVED" && sheet.entries.some((entry) => entry.invoiceId !== null);
  });
  if (invoicedWeek) {
    return NextResponse.json({
      message: `The week of ${isoDay(invoicedWeek)} already contains invoiced delivery. It remains flagged for finance review and cannot be reopened without changing invoice history.`,
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    for (const weekStart of weeks) {
      const existing = sheetByWeek.get(isoDay(weekStart));
      if (!existing) {
        await tx.timesheet.create({ data: { userId, weekStart, status: "DRAFT" } });
      } else if (existing.status !== "DRAFT") {
        // No invoices exist on this week (guarded above), so returning it to
        // Draft preserves the already recorded entries while allowing the
        // Developer to add the missing pre-start dates and resubmit.
        await tx.timesheet.update({
          where: { id: existing.id },
          data: { status: "DRAFT", submittedAt: null, decidedById: null, decidedAt: null, decisionNote: null },
        });
      }
    }

    await notify({
      userId,
      kind: "TIMESHEET",
      title: `Pre-start time reopened: ${assignment.project.name}`,
      body: `${context.user.name} reopened ${missingDays.length} unfiled pre-start working day${missingDays.length === 1 ? "" : "s"}. Please record only the actual time worked and submit it for approval; no hours have been prefilled.`,
      link: `/timesheets?week=${isoDay(firstWeek)}`,
    }, tx);

    // This alert goes to exactly the two executive roles, not the wider set of
    // users who may happen to hold a finance-report permission.
    const executives = await tx.user.findMany({
      where: { status: "ACTIVE", role: { key: { in: [ROLE.CEO, ROLE.CO_FOUNDER] } } },
      select: { id: true },
    });
    await notifyMany(executives.map((executive) => executive.id), {
      kind: "TIMESHEET",
      title: `Pre-start backfill reopened: ${assignment.user.name}`,
      body: `${context.user.name} reopened ${missingDays.length} missing pre-start working day${missingDays.length === 1 ? "" : "s"} for ${assignment.user.name} on ${assignment.project.name}. The days remain unbooked until the Developer submits actual time.`,
      link: "/reports/revenue",
    }, tx);

    await recordAudit({
      actorId: context.user.id,
      action: "timesheet.prestart_backfill.reopen",
      entityType: "Project",
      entityId: projectId,
      after: {
        developerId: userId,
        developer: assignment.user.name,
        project: assignment.project.name,
        missingDays: missingDays.map(isoDay),
        reopenedWeeks: weeks.map(isoDay),
      },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: `${missingDays.length} unfiled pre-start working day${missingDays.length === 1 ? "" : "s"} reopened for ${assignment.user.name}. No hours or revenue were created.`,
    days: missingDays.map(isoDay),
  });
}
