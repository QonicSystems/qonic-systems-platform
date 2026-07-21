import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const OUTCOMES = ["PENDING", "ADVANCE", "REJECT", "NO_SHOW"];

/** Schedule an interview. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  const application = await db.application.findUnique({ where: { id }, include: { candidate: true } });
  if (!application) return NextResponse.json({ message: "That application could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const scheduledAt = new Date(String(input.scheduledAt ?? ""));
  if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ message: "Please choose a date and time." }, { status: 422 });

  const duration = Number(input.durationMins ?? 60);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ message: "Duration must be between 5 and 480 minutes." }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        applicationId: id, scheduledAt, durationMins: duration,
        kind: String(input.kind ?? "Screening").trim() || "Screening",
        location: String(input.location ?? "").trim() || null,
        interviewerId: String(input.interviewerId ?? "").trim() || null,
      },
    });
    // Scheduling an interview implies the pipeline stage, so keep them in step
    // rather than making the recruiter remember to move it separately.
    if (["SOURCED", "SCREENED", "SUBMITTED"].includes(application.stage)) {
      await tx.application.update({ where: { id }, data: { stage: "INTERVIEW" } });
      await tx.applicationEvent.create({ data: { applicationId: id, fromStage: application.stage, toStage: "INTERVIEW", actorId: context.user.id, note: "Interview scheduled." } });
    }
    await recordAudit({ actorId: context.user.id, action: "interview.schedule", entityType: "Application", entityId: id, after: { candidate: application.candidate.name, at: scheduledAt.toISOString() }, ipAddress: clientIp(request) }, tx);
    return interview;
  });

  return NextResponse.json({ message: `Interview scheduled for ${application.candidate.name}.`, id: created.id });
}

/** Record the scorecard. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const interviewId = String(input.interviewId ?? "");
  const outcome = String(input.outcome ?? "");
  const scoreRaw = input.score;
  const feedback = String(input.feedback ?? "").trim().slice(0, 2000);

  const interview = await db.interview.findUnique({ where: { id: interviewId } });
  if (!interview || interview.applicationId !== id) return NextResponse.json({ message: "That interview could not be found." }, { status: 404 });
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ message: "That is not a valid outcome." }, { status: 400 });

  const score = scoreRaw === "" || scoreRaw === null || scoreRaw === undefined ? null : Number(scoreRaw);
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
    return NextResponse.json({ message: "Score must be a whole number from 1 to 5." }, { status: 422 });
  }
  // A decision without a rationale is not a scorecard.
  if (outcome !== "PENDING" && feedback.length < 3) {
    return NextResponse.json({ message: "Please record your feedback." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.interview.update({ where: { id: interviewId }, data: { outcome: outcome as never, score, feedback: feedback || null } });
    await recordAudit({ actorId: context.user.id, action: "interview.feedback", entityType: "Application", entityId: id, after: { outcome, score }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: "Feedback recorded." });
}
