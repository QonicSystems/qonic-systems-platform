import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Upserts the monthly client deal amount for one person on one project, admin-only. */
export async function PATCH(request: Request) {
  const { context, response } = await guardRoute("payout.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const userId = String(input.userId ?? "");
  const projectId = String(input.projectId ?? "");
  const assignment = await db.projectAssignment.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!assignment) return NextResponse.json({ message: "That person is not assigned to that project." }, { status: 404 });

  const monthlyAmount = toMinor(String(input.monthlyAmount ?? ""));
  if (monthlyAmount === null || Number.isNaN(monthlyAmount)) {
    return NextResponse.json({ message: "Enter the monthly deal amount as a number, e.g. 150000." }, { status: 422 });
  }

  const effectiveFromInput = String(input.effectiveFrom ?? "");
  const effectiveFrom = new Date(`${effectiveFromInput}T00:00:00.000Z`);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return NextResponse.json({ message: "Please choose a valid effective-from date." }, { status: 422 });
  }

  const existing = await db.resourceDeal.findUnique({ where: { userId_projectId: { userId, projectId } } });

  await db.$transaction(async (tx) => {
    await tx.resourceDeal.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: { monthlyAmount, effectiveFrom },
      create: { userId, projectId, monthlyAmount, effectiveFrom },
    });
    await recordAudit({
      actorId: context.user.id,
      action: existing ? "payout.deal.update" : "payout.deal.create",
      entityType: "ResourceDeal",
      entityId: existing?.id ?? `${userId}:${projectId}`,
      before: existing ? { monthlyAmount: existing.monthlyAmount, effectiveFrom: existing.effectiveFrom.toISOString().slice(0, 10) } : undefined,
      after: { monthlyAmount, effectiveFrom: effectiveFromInput },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Deal amount saved." });
}
