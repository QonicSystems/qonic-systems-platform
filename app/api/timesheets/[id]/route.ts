import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { MAX_DAY_MINUTES, canEditTimesheet, canRecallTimesheet, canSubmitTimesheet, parseDuration } from "@/lib/delivery/timesheet";
import { notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type IncomingEntry = { projectId: string; taskId: string | null; workDate: string; duration: string; note: string };

/**
 * Replaces a week's entries wholesale, and optionally submits it.
 *
 * A whole-week replace is simpler and safer than diffing individual rows: the
 * grid is small, and it removes any chance of an orphaned entry surviving an
 * edit. Everything happens in one transaction so a week is never half-saved.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("timesheet.submit");
  if (response) return response;

  const { id } = await params;
  const sheet = await db.timesheet.findUnique({ where: { id } });
  if (!sheet) return NextResponse.json({ message: "That timesheet could not be found." }, { status: 404 });
  if (!canEditTimesheet(context, sheet)) {
    return NextResponse.json({ message: "That week can no longer be edited." }, { status: 409 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const submit = input.submit === true;
  const rows = Array.isArray(input.entries) ? input.entries as IncomingEntry[] : [];

  // Only projects the person is actually assigned to may receive time.
  const assignments = await db.projectAssignment.findMany({ where: { userId: context.user.id }, select: { projectId: true } });
  const allowedProjects = new Set(assignments.map((assignment) => assignment.projectId));

  const prepared: { projectId: string; taskId: string | null; workDate: Date; minutes: number; billable: boolean; note: string | null }[] = [];
  const dayTotals = new Map<string, number>();

  for (const row of rows) {
    const minutes = parseDuration(String(row?.duration ?? ""));
    if (minutes === null) return NextResponse.json({ message: `"${row?.duration}" is not a valid duration. Use 7.5, 7:30, or 450m.` }, { status: 422 });
    if (minutes === 0) continue; // Blank cells are simply absent.
    if (minutes < 0) return NextResponse.json({ message: "Time cannot be negative." }, { status: 422 });

    const projectId = String(row?.projectId ?? "");
    if (!allowedProjects.has(projectId)) {
      return NextResponse.json({ message: "You can only record time against projects you are assigned to." }, { status: 403 });
    }

    const workDate = new Date(`${String(row?.workDate ?? "")}T00:00:00.000Z`);
    if (Number.isNaN(workDate.getTime())) return NextResponse.json({ message: "One of the dates is invalid." }, { status: 422 });

    // The date must fall inside this timesheet's own week.
    const offsetDays = Math.floor((workDate.getTime() - sheet.weekStart.getTime()) / 86_400_000);
    if (offsetDays < 0 || offsetDays > 6) return NextResponse.json({ message: "An entry falls outside this week." }, { status: 422 });

    const key = workDate.toISOString().slice(0, 10);
    const dayTotal = (dayTotals.get(key) ?? 0) + minutes;
    if (dayTotal > MAX_DAY_MINUTES) {
      return NextResponse.json({ message: `More than ${MAX_DAY_MINUTES / 60} hours booked on ${key}. Please check the entries.` }, { status: 422 });
    }
    dayTotals.set(key, dayTotal);

    const taskId = row?.taskId ? String(row.taskId) : null;
    // Snapshot the task's billable flag so a later task change cannot re-bill
    // work that has already been approved.
    const task = taskId ? await db.projectTask.findUnique({ where: { id: taskId } }) : null;
    if (taskId && (!task || task.projectId !== projectId)) {
      return NextResponse.json({ message: "One of the tasks does not belong to its project." }, { status: 422 });
    }

    prepared.push({ projectId, taskId, workDate, minutes, billable: task?.billable ?? true, note: String(row?.note ?? "").trim().slice(0, 500) || null });
  }

  const total = prepared.reduce((sum, entry) => sum + entry.minutes, 0);

  if (submit) {
    const allowed = canSubmitTimesheet(context, sheet, total);
    if (!allowed.ok) return NextResponse.json({ message: allowed.reason }, { status: allowed.status });
  }

  await db.$transaction(async (tx) => {
    await tx.timeEntry.deleteMany({ where: { timesheetId: sheet.id } });
    if (prepared.length > 0) {
      await tx.timeEntry.createMany({ data: prepared.map((entry) => ({ ...entry, timesheetId: sheet.id })) });
    }
    await tx.timesheet.update({
      where: { id: sheet.id },
      data: submit
        ? { status: "SUBMITTED", submittedAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null }
        : { status: "DRAFT" },
    });
    if (submit) {
      await notifyLeadership({
        kind: "TIMESHEET",
        title: `Timesheet Submitted: ${context.user.name}`,
        body: `${context.user.name} submitted a timesheet (${(total / 60).toFixed(1)} hrs) for week of ${sheet.weekStart.toISOString().slice(0, 10)}.`,
        link: `/timesheets`,
      }, tx);
    }
    await recordAudit({
      actorId: context.user.id,
      action: submit ? "timesheet.submit" : "timesheet.save",
      entityType: "Timesheet",
      entityId: sheet.id,
      after: { week: sheet.weekStart.toISOString().slice(0, 10), minutes: total, entries: prepared.length },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    // Not "Draft saved" — nothing is kept aside as a draft. The week is written
    // exactly as it was sent, so an emptied grid clears it.
    message: submit
      ? "Timesheet submitted for approval."
      : total === 0
      ? "Week saved as empty — its time entries have been removed."
      : "Week saved. It has not been sent for approval yet.",
    totalMinutes: total,
  });
}

/**
 * Pull a submitted week back to draft so it can be corrected.
 *
 * Without this, the only way out of a mistaken submission was for an approver to
 * reject it — which left a rejection on a week whose only fault was a typo.
 * The entries are untouched; only the status moves.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("timesheet.submit");
  if (response) return response;

  const { id } = await params;
  const sheet = await db.timesheet.findUnique({ where: { id } });
  if (!sheet) return NextResponse.json({ message: "That timesheet could not be found." }, { status: 404 });

  const allowed = canRecallTimesheet(context, sheet);
  if (!allowed.ok) return NextResponse.json({ message: allowed.reason }, { status: allowed.status });

  await db.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: sheet.id },
      data: { status: "DRAFT", submittedAt: null, decidedById: null, decidedAt: null, decisionNote: null },
    });
    await recordAudit({
      actorId: context.user.id,
      action: "timesheet.recall",
      entityType: "Timesheet",
      entityId: sheet.id,
      before: { status: sheet.status },
      after: { status: "DRAFT", week: sheet.weekStart.toISOString().slice(0, 10) },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Week unlocked for editing. Your time entries are unchanged — submit again when you are ready." });
}
