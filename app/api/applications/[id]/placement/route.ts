import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { placementFee, toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Records a placement and moves the application to PLACED.
 *
 * This is the only route to PLACED — moving the stage directly is refused,
 * because that path would not capture the salary and fee the business runs on.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("placement.manage");
  if (response) return response;

  const { id } = await params;
  const application = await db.application.findUnique({
    where: { id },
    include: { candidate: true, job: true, placement: true },
  });
  if (!application) return NextResponse.json({ message: "That application could not be found." }, { status: 404 });
  if (application.placement) return NextResponse.json({ message: "This application already has a placement recorded." }, { status: 409 });
  if (["REJECTED", "WITHDRAWN"].includes(application.stage)) {
    return NextResponse.json({ message: "A rejected or withdrawn application cannot be placed." }, { status: 409 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const startDate = String(input.startDate ?? "").trim();
  const salary = toMinor(String(input.salary ?? ""));
  const feeRaw = String(input.feePercent ?? "").trim();

  const errors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.startDate = "Please enter the start date.";
  if (salary === null || Number.isNaN(salary) || salary <= 0) errors.salary = "Enter the annual salary as a number.";
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(feeRaw)) errors.feePercent = "Enter the fee as a percentage, e.g. 12.5.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const feePercent = Number(feeRaw);
  // The fee is computed and STORED, not derived on read: a later change to the
  // client's fee policy must not rewrite revenue already booked.
  const feeAmount = placementFee(salary!, feePercent);

  await db.$transaction(async (tx) => {
    await tx.placement.create({
      data: {
        applicationId: id,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        salary: salary!, currency: application.job.currency, feePercent, feeAmount,
        recruiterId: application.ownerId ?? context.user.id,
        guaranteeDays: Number(input.guaranteeDays ?? 90) || null,
      },
    });
    await tx.application.update({ where: { id }, data: { stage: "PLACED" } });
    await tx.applicationEvent.create({ data: { applicationId: id, fromStage: application.stage, toStage: "PLACED", actorId: context.user.id, note: `Placed from ${startDate}.` } });

    // Close the requisition once every opening is filled.
    const placed = await tx.application.count({ where: { jobId: application.jobId, stage: "PLACED" } });
    if (placed >= application.job.openings) {
      await tx.job.update({ where: { id: application.jobId }, data: { status: "FILLED", isPublished: false } });
    }

    await recordAudit({
      actorId: context.user.id, action: "placement.create", entityType: "Application", entityId: id,
      after: { candidate: application.candidate.name, job: application.job.reference, salary, feeAmount },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: `${application.candidate.name} placed. Fee recorded.` });
}
