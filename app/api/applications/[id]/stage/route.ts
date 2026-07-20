import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { STAGE_LABELS, canMoveStage } from "@/lib/ats/pipeline";
import { db } from "@/lib/db";
import type { ApplicationStage } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const application = await db.application.findUnique({ where: { id }, include: { candidate: true, job: true } });
  if (!application) return NextResponse.json({ message: "That application could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const to = String(input.to ?? "") as ApplicationStage;
  const note = String(input.note ?? "").trim().slice(0, 1000);

  const allowed = canMoveStage(context, application.stage, to);
  if (!allowed.ok) return NextResponse.json({ message: allowed.reason }, { status: allowed.status });

  // Turning someone down without a reason leaves no usable record.
  if ((to === "REJECTED" || to === "WITHDRAWN") && note.length < 3) {
    return NextResponse.json({ message: "Please give a reason." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: { stage: to, outcomeReason: to === "REJECTED" || to === "WITHDRAWN" ? note : application.outcomeReason },
    });
    await tx.applicationEvent.create({ data: { applicationId: id, fromStage: application.stage, toStage: to, actorId: context.user.id, note: note || null } });
    await recordAudit({
      actorId: context.user.id, action: `application.${to.toLowerCase()}`, entityType: "Application", entityId: id,
      before: { stage: application.stage }, after: { stage: to, candidate: application.candidate.name, job: application.job.reference },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${application.candidate.name} moved to ${STAGE_LABELS[to]}.` });
}
