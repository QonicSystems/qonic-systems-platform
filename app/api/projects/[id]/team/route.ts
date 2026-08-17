import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { notify, notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Assign someone to a project, or change their allocation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ message: "That project no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const userId = String(input.userId ?? "");
  const allocation = Number(input.allocationPercent ?? 100);

  if (!Number.isInteger(allocation) || allocation < 1 || allocation > 100) {
    return NextResponse.json({ message: "Allocation must be a whole number between 1 and 100." }, { status: 422 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ message: "That person is not an active member of staff." }, { status: 422 });

  await db.$transaction(async (tx) => {
    await tx.projectAssignment.upsert({
      where: { projectId_userId: { projectId: id, userId } },
      update: { allocationPercent: allocation },
      create: { projectId: id, userId, allocationPercent: allocation },
    });

    // 1. Notify the assigned employee
    await notify({
      userId: user.id,
      kind: "SYSTEM",
      title: `Assigned to ${project.name}`,
      body: `You have been allocated to ${project.name} (${allocation}%). You can now book time and manage deliverables.`,
      link: `/projects/${project.id}`,
    }, tx);

    // 2. Notify Leadership (Founder and Co-Founder)
    await notifyLeadership({
      kind: "SYSTEM",
      title: `Team Allocation: ${user.name} → ${project.name}`,
      body: `${context.user.name} allocated ${user.name} (${allocation}%) to project ${project.name}.`,
      link: `/projects/${project.id}`,
    }, tx);

    await recordAudit({ actorId: context.user.id, action: "project.assign", entityType: "Project", entityId: id, after: { user: user.email, allocation }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `${user.name} assigned at ${allocation}%.` });
}

/** Remove someone from a project. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";

  const assignment = await db.projectAssignment.findUnique({ where: { projectId_userId: { projectId: id, userId } }, include: { user: true } });
  if (!assignment) return NextResponse.json({ message: "That person is not assigned to this project." }, { status: 404 });

  // Time already booked must keep its project, so removal is blocked once
  // someone has recorded hours. Their access to book MORE time ends either way.
  const booked = await db.timeEntry.count({ where: { projectId: id, timesheet: { userId } } });
  if (booked > 0) {
    return NextResponse.json({
      message: `${assignment.user.name} has already booked time to this project, so the assignment cannot be removed. Set their allocation to reflect the change instead.`,
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.projectAssignment.delete({ where: { projectId_userId: { projectId: id, userId } } });
    await recordAudit({ actorId: context.user.id, action: "project.unassign", entityType: "Project", entityId: id, before: { user: assignment.user.email }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `${assignment.user.name} removed from the project.` });
}
