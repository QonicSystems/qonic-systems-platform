import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * The things time can be booked against on a project.
 *
 * Every project is created with a single "General" task and there was no way to
 * add another, so every hour anyone logged was General and the per-task billable
 * flag — which the invoice builder reads to decide what is chargeable — could
 * never be varied.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ message: "That project no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const name = String(input.name ?? "").trim().slice(0, 200);
  if (name.length < 2) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { name: "Name the task." } }, { status: 422 });

  const clash = await db.projectTask.findFirst({ where: { projectId: id, name } });
  if (clash) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { name: "That task already exists on this project." } }, { status: 422 });

  // A non-billable project can have no billable task, whatever was requested.
  const billable = project.billing === "NON_BILLABLE" ? false : input.billable !== false;
  const count = await db.projectTask.count({ where: { projectId: id } });

  const created = await db.$transaction(async (tx) => {
    const task = await tx.projectTask.create({ data: { projectId: id, name, billable, sortOrder: count } });
    await recordAudit({
      actorId: context.user.id, action: "project.task.create", entityType: "Project", entityId: id,
      after: { name, billable }, ipAddress: clientIp(request),
    }, tx);
    return task;
  });

  return NextResponse.json({ message: `“${created.name}” added.`, id: created.id });
}

/** Rename a task, change whether it bills, or retire it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const taskId = String(input.taskId ?? "");
  const task = await db.projectTask.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== id) return NextResponse.json({ message: "That task could not be found." }, { status: 404 });

  const data: { name?: string; billable?: boolean; isActive?: boolean } = {};
  if (typeof input.name === "string") {
    const name = input.name.trim().slice(0, 200);
    if (name.length < 2) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { name: "Name the task." } }, { status: 422 });
    data.name = name;
  }
  if (typeof input.billable === "boolean") data.billable = input.billable;
  if (typeof input.isActive === "boolean") data.isActive = input.isActive;
  if (Object.keys(data).length === 0) return NextResponse.json({ message: "Nothing to change." }, { status: 400 });

  // Retiring the last bookable task would leave the timesheet grid with nothing
  // to offer, so the project must always keep one active.
  if (data.isActive === false) {
    const remaining = await db.projectTask.count({ where: { projectId: id, isActive: true, NOT: { id: taskId } } });
    if (remaining === 0) return NextResponse.json({ message: "A project needs at least one task people can book time to." }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.projectTask.update({ where: { id: taskId }, data });
    await recordAudit({
      actorId: context.user.id, action: "project.task.update", entityType: "Project", entityId: id,
      before: { name: task.name, billable: task.billable, isActive: task.isActive }, after: data,
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `“${data.name ?? task.name}” updated.` });
}

/** Delete a task outright — only while no time has been booked to it. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  const taskId = new URL(request.url).searchParams.get("taskId") ?? "";
  const task = await db.projectTask.findUnique({ where: { id: taskId }, include: { _count: { select: { timeEntries: true } } } });
  if (!task || task.projectId !== id) return NextResponse.json({ message: "That task could not be found." }, { status: 404 });

  if (task._count.timeEntries > 0) {
    return NextResponse.json({
      message: `“${task.name}” has ${task._count.timeEntries} time ${task._count.timeEntries === 1 ? "entry" : "entries"} booked to it and cannot be deleted. Retire it instead — booked time keeps its task.`,
    }, { status: 409 });
  }

  const remaining = await db.projectTask.count({ where: { projectId: id, NOT: { id: taskId } } });
  if (remaining === 0) return NextResponse.json({ message: "A project needs at least one task people can book time to." }, { status: 409 });

  await db.$transaction(async (tx) => {
    await tx.projectTask.delete({ where: { id: taskId } });
    await recordAudit({
      actorId: context.user.id, action: "project.task.delete", entityType: "Project", entityId: id,
      before: { name: task.name }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `“${task.name}” deleted.` });
}
