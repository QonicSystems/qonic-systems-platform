import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Delete a requisition. Requires job.manage.
 *
 * Refuses while any candidate is attached. Application cascades from Job, and
 * everything beneath it — stage history, interviews, and the placement with its
 * fee — cascades in turn, so one delete could silently erase a whole hiring
 * record and the revenue attached to it. A job with a pipeline gets closed.
 *
 * This is also what blocks client deletion: Job.clientId is Restrict, so a
 * client cannot be removed while any requisition still points at it.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("job.manage");
  if (response) return response;

  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) return NextResponse.json({ message: "That job could not be found." }, { status: 404 });

  const placements = await db.placement.count({ where: { application: { jobId: id } } });
  const { applications } = job._count;

  // A placement is billed revenue. It is never destroyable through this route,
  // regardless of confirmation, because nothing else records the fee.
  if (placements > 0) {
    return NextResponse.json({
      message: `${job.reference} has ${placements} recorded placement${placements === 1 ? "" : "s"} and can never be deleted — that is billed revenue. Close the job instead.`,
      blockers: { applications, placements },
    }, { status: 409 });
  }

  if (applications > 0) {
    return NextResponse.json({
      message: `${job.reference} has ${applications} candidate${applications === 1 ? "" : "s"} in its pipeline and cannot be deleted. Close the job instead — the pipeline history stays intact.`,
      blockers: { applications, placements },
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await recordAudit({
      actorId: context.user.id, action: "job.delete", entityType: "Job", entityId: id,
      before: { reference: job.reference, title: job.title, status: job.status },
      ipAddress: clientIp(request),
    }, tx);
    await tx.job.delete({ where: { id } });
  });

  return NextResponse.json({ message: `${job.reference} deleted.` });
}
