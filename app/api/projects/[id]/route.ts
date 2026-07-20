import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinorUnits, validateProject } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const HEALTH = ["ON_TRACK", "AT_RISK", "OFF_TRACK"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.project.findUnique({ where: { id }, include: { client: true } });
  if (!existing) return NextResponse.json({ message: "That project no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  // The health flag can be set on its own without re-validating the whole project.
  if (Object.keys(input).length === 1 && typeof input.health === "string") {
    const health = input.health;
    if (!HEALTH.includes(health)) return NextResponse.json({ message: "That is not a valid health status." }, { status: 400 });
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { health: health as never } });
      await recordAudit({ actorId: context.user.id, action: "project.health", entityType: "Project", entityId: id, before: { health: existing.health }, after: { health }, ipAddress: clientIp(request) }, tx);
    });
    return NextResponse.json({ message: `${existing.name} marked ${health.toLowerCase().replace(/_/g, " ")}.` });
  }

  const { data, errors } = validateProject({ ...input, clientId: existing.clientId });
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  // The client prefix is fixed once created; only the suffix may change.
  const code = `${existing.client.code}-${data.code}`;
  if (code !== existing.code && await db.project.findUnique({ where: { code } })) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { code: "That code is already in use for this client." } }, { status: 422 });
  }

  const health = typeof input.health === "string" && HEALTH.includes(input.health) ? input.health : existing.health;

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: {
        name: data.name, code, status: data.status as never, billing: data.billing as never, health: health as never,
        budgetAmount: toMinorUnits(data.budgetAmount), budgetCurrency: data.budgetCurrency || "INR",
        defaultRate: toMinorUnits(data.defaultRate),
        startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
        endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
        managerId: data.managerId || null,
        notes: data.notes || null,
      },
    });
    // Keep the manager bookable on their own project.
    if (data.managerId) {
      await tx.projectAssignment.upsert({
        where: { projectId_userId: { projectId: id, userId: data.managerId } },
        update: {}, create: { projectId: id, userId: data.managerId },
      });
    }
    await recordAudit({
      actorId: context.user.id, action: "project.update", entityType: "Project", entityId: id,
      before: { name: existing.name, status: existing.status, code: existing.code },
      after: { name: data.name, status: data.status, code },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${data.name} updated.` });
}
