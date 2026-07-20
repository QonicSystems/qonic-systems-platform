import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  if (!await db.project.findUnique({ where: { id } })) {
    return NextResponse.json({ message: "That project no longer exists." }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const name = String(input.name ?? "").trim();
  const dueDate = String(input.dueDate ?? "").trim();
  const amountRaw = String(input.amount ?? "").trim();
  const errors: Record<string, string> = {};

  if (name.length < 2) errors.name = "Please name the milestone.";
  if (!DATE.test(dueDate)) errors.dueDate = "Please enter a due date.";
  const amount = toMinor(amountRaw);
  if (Number.isNaN(amount)) errors.amount = "Enter the amount as a number.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const count = await db.projectMilestone.count({ where: { projectId: id } });
  const created = await db.$transaction(async (tx) => {
    const milestone = await tx.projectMilestone.create({
      data: { projectId: id, name, dueDate: new Date(`${dueDate}T00:00:00.000Z`), amount, sortOrder: count },
    });
    await recordAudit({ actorId: context.user.id, action: "milestone.create", entityType: "Project", entityId: id, after: { name, dueDate }, ipAddress: clientIp(request) }, tx);
    return milestone;
  });

  return NextResponse.json({ message: `Milestone “${created.name}” added.`, id: created.id });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const milestoneId = String(input.milestoneId ?? "");
  const status = String(input.status ?? "");

  if (!STATUSES.includes(status)) return NextResponse.json({ message: "That is not a valid milestone status." }, { status: 400 });

  const milestone = await db.projectMilestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== id) return NextResponse.json({ message: "That milestone could not be found." }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.projectMilestone.update({
      where: { id: milestoneId },
      data: { status: status as never, completedAt: status === "COMPLETED" ? new Date() : null },
    });
    await recordAudit({ actorId: context.user.id, action: "milestone.status", entityType: "Project", entityId: id, before: { status: milestone.status }, after: { milestone: milestone.name, status }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `“${milestone.name}” marked ${status.toLowerCase().replace(/_/g, " ")}.` });
}
