import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { canDecideTimesheet } from "@/lib/delivery/timesheet";
import { payoutLinesFor } from "@/lib/delivery/payout";
import type { ContractPayload } from "@/lib/contracts/payload";
import { toMinor } from "@/lib/money";
import { notify, notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Approve or reject a submitted week. Approval locks it against further edits. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const sheet = await db.timesheet.findUnique({ where: { id }, include: { user: { select: { name: true } }, entries: true } });
  if (!sheet) return NextResponse.json({ message: "That timesheet could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const decision = String(input.decision ?? "");
  const note = String(input.note ?? "").trim().slice(0, 1000);

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ message: "That is not a valid decision." }, { status: 400 });
  }

  const allowed = canDecideTimesheet(context, sheet);
  if (!allowed.ok) return NextResponse.json({ message: allowed.reason }, { status: allowed.status });

  // A rejection needs a reason — otherwise the person has nothing to act on.
  if (decision === "REJECTED" && note.length < 3) {
    return NextResponse.json({ message: "Please explain what needs to change." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: sheet.id },
      data: { status: decision, decidedById: context.user.id, decidedAt: new Date(), decisionNote: note || null },
    });

    if (decision === "APPROVED") {
      // The payout ledger is generated the same moment time becomes "real"
      // for client billing — see lib/delivery/payout.ts for the day-based,
      // backfill-vs-actual rule this applies. The daily rate comes from the
      // person's own employment contract, not the project — see the module
      // comment in lib/delivery/payout.ts for why that's per-person.
      const projectIds = [...new Set(sheet.entries.map((entry) => entry.projectId))];
      const [assignments, latestLetter] = await Promise.all([
        tx.projectAssignment.findMany({
          where: { userId: sheet.userId, projectId: { in: projectIds } },
          select: { projectId: true, startedOn: true, createdAt: true },
        }),
        tx.contractLetter.findFirst({
          where: { subjectUserId: sheet.userId, status: { in: ["RELEASED", "ACKNOWLEDGED"] } },
          orderBy: { updatedAt: "desc" },
          select: { payload: true },
        }),
      ]);
      const monthlyCompensationRaw = latestLetter ? (latestLetter.payload as unknown as ContractPayload).monthlyCompensation : null;
      const monthlyCompensation = monthlyCompensationRaw ? toMinor(monthlyCompensationRaw) : null;

      const lines = payoutLinesFor(
        sheet.entries,
        // Deliberately just these two tiers, not Project.startDate: this date
        // decides ACTUAL_PAYOUT vs BILLED_TO_COMPANY, i.e. when THIS
        // person's own assignment truly began — Project.startDate answers a
        // different question (when the project itself began) and, being
        // earlier by construction, would silently reclassify every backfilled
        // day as ACTUAL_PAYOUT the moment it was consulted as a fallback.
        assignments.map((assignment) => ({
          projectId: assignment.projectId,
          assignmentStartedAt: assignment.startedOn ?? assignment.createdAt,
        })),
        monthlyCompensation && !Number.isNaN(monthlyCompensation) ? monthlyCompensation : null,
      );

      for (const line of lines) {
        await tx.payoutLedgerEntry.upsert({
          where: { userId_projectId_workDate: { userId: sheet.userId, projectId: line.projectId, workDate: line.workDate } },
          // A recall→re-approve cycle must not drift the frozen amount/category
          // from an earlier approval — only create is meaningful here, not update.
          update: {},
          create: {
            userId: sheet.userId, projectId: line.projectId, timesheetId: sheet.id,
            workDate: line.workDate, amount: line.amount, category: line.category,
          },
        });
      }

      if (lines.length > 0) {
        await recordAudit({
          actorId: context.user.id,
          action: "payout.ledger.generate",
          entityType: "Timesheet",
          entityId: sheet.id,
          after: { week: sheet.weekStart.toISOString().slice(0, 10), employee: sheet.user.name, lines: lines.length },
          ipAddress: clientIp(request),
        }, tx);
      }
    }

    await notify({
      userId: sheet.userId, kind: "TIMESHEET",
      title: decision === "APPROVED" ? "Your timesheet was approved" : "Your timesheet needs changes",
      body: note || undefined,
      link: `/timesheets?week=${sheet.weekStart.toISOString().slice(0, 10)}`,
    }, tx);
    await notifyLeadership({
      kind: "TIMESHEET",
      title: `Timesheet ${decision === "APPROVED" ? "Approved" : "Rejected"}: ${sheet.user.name}`,
      body: `${context.user.name} ${decision.toLowerCase()} the timesheet for ${sheet.user.name} (week ${sheet.weekStart.toISOString().slice(0, 10)}).`,
      link: `/timesheets`,
    }, tx);
    await recordAudit({
      actorId: context.user.id,
      action: `timesheet.${decision.toLowerCase()}`,
      entityType: "Timesheet",
      entityId: sheet.id,
      before: { status: sheet.status },
      after: { status: decision, week: sheet.weekStart.toISOString().slice(0, 10), employee: sheet.user.name },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: decision === "APPROVED"
      ? `${sheet.user.name}'s week was approved and is now locked.`
      : `${sheet.user.name}'s week was sent back for changes.`,
  });
}
