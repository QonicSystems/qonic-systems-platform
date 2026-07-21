import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Put an existing candidate forward for a job. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const jobId = String(input.jobId ?? "");
  const candidateId = String(input.candidateId ?? "");

  const [job, candidate] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.candidate.findUnique({ where: { id: candidateId } }),
  ]);
  if (!job || !candidate) return NextResponse.json({ message: "That job or candidate no longer exists." }, { status: 404 });
  if (!["OPEN", "DRAFT"].includes(job.status)) {
    return NextResponse.json({ message: `${job.reference} is ${job.status.toLowerCase()} and is not taking candidates.` }, { status: 409 });
  }

  // The unique constraint would throw; a clear message is more useful.
  if (await db.application.findUnique({ where: { jobId_candidateId: { jobId, candidateId } } })) {
    return NextResponse.json({ message: `${candidate.name} has already been put forward for this job.` }, { status: 409 });
  }

  const created = await db.$transaction(async (tx) => {
    const application = await tx.application.create({
      data: { jobId, candidateId, stage: "SOURCED", ownerId: context.user.id },
    });
    await tx.applicationEvent.create({ data: { applicationId: application.id, fromStage: null, toStage: "SOURCED", actorId: context.user.id, note: "Added to the pipeline." } });
    await recordAudit({ actorId: context.user.id, action: "application.create", entityType: "Application", entityId: application.id, after: { job: job.reference, candidate: candidate.name }, ipAddress: clientIp(request) }, tx);
    return application;
  });

  return NextResponse.json({ message: `${candidate.name} added to ${job.reference}.`, id: created.id });
}
