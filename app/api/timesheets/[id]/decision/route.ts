import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { canDecideTimesheet } from "@/lib/delivery/timesheet";
import { notify, notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Approve or reject a submitted week. Approval locks it against further edits. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const sheet = await db.timesheet.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
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
