import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { canDecideLeave } from "@/lib/leave/leave";
import { notify, notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Approve, reject, or cancel a leave request. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const leave = await db.leaveRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, managerId: true } }, leaveType: true },
  });
  if (!leave) return NextResponse.json({ message: "That leave request could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const decision = String(input.decision ?? "");
  const note = String(input.note ?? "").trim().slice(0, 1000);

  // Cancelling is the requester withdrawing their own pending request — a
  // different action from a manager deciding it.
  if (decision === "CANCELLED") {
    if (leave.userId !== context.user.id) return NextResponse.json({ message: "Only the person who requested this leave can cancel it." }, { status: 403 });
    if (leave.status !== "PENDING") return NextResponse.json({ message: "Only a pending request can be cancelled." }, { status: 409 });

    await db.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id: leave.id }, data: { status: "CANCELLED", decidedAt: new Date(), decidedById: context.user.id } });
      await recordAudit({ actorId: context.user.id, action: "leave.cancel", entityType: "LeaveRequest", entityId: leave.id, ipAddress: clientIp(request) }, tx);
    });
    return NextResponse.json({ message: "Leave request cancelled." });
  }

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ message: "That is not a valid decision." }, { status: 400 });
  }

  const allowed = canDecideLeave(context, leave, leave.user.managerId);
  if (!allowed.ok) return NextResponse.json({ message: allowed.reason }, { status: allowed.status });

  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: leave.id },
      data: { status: decision, decidedById: context.user.id, decidedAt: new Date(), decisionNote: note || null },
    });

    // The balance moves in the SAME transaction as the decision, so the two can
    // never disagree — and only on approval, since a rejection consumes nothing.
    if (decision === "APPROVED" && leave.leaveType.tracksBalance) {
      const year = leave.startDate.getUTCFullYear();
      await tx.leaveBalance.upsert({
        where: { userId_leaveTypeId_year: { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year } },
        update: { usedDays: { increment: leave.days } },
        create: { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year, entitledDays: leave.leaveType.annualDays, usedDays: leave.days },
      });
    }

    await notify({
      userId: leave.userId, kind: "LEAVE",
      title: `Your leave was ${decision.toLowerCase()}`,
      body: `${leave.days} day(s) of ${leave.leaveType.label}${note ? ` — “${note}”` : ""}`,
      link: "/leave",
    }, tx);
    await notifyLeadership({
      kind: "LEAVE",
      title: `Leave ${decision === "APPROVED" ? "Approved" : "Rejected"}: ${leave.user.name}`,
      body: `${context.user.name} ${decision.toLowerCase()} ${leave.days} day(s) of ${leave.leaveType.label} for ${leave.user.name}.`,
      link: `/leave`,
    }, tx);
    await recordAudit({
      actorId: context.user.id, action: `leave.${decision.toLowerCase()}`, entityType: "LeaveRequest", entityId: leave.id,
      before: { status: leave.status }, after: { status: decision, days: leave.days, employee: leave.user.name }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${leave.user.name}'s leave was ${decision.toLowerCase()}.` });
}
