import { NextResponse } from "next/server";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type ApplyErrors = Partial<Record<"name" | "email" | "phone" | "resumeUrl" | "consent" | "jobId", string>>;

/**
 * PUBLIC endpoint — the only unauthenticated write in the application.
 *
 * It is deliberately narrow: it can create a candidate and one application
 * against an already-published job, and nothing else. It cannot set a stage,
 * touch an existing candidate's data, or reach a job that is not public.
 */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const jobId = String(input.jobId ?? "");
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();
  const resumeUrl = String(input.resumeUrl ?? "").trim();
  const note = String(input.note ?? "").trim().slice(0, 2000);

  const errors: ApplyErrors = {};
  if (name.length < 2) errors.name = "Please enter your name.";
  if (!emailPattern.test(email)) errors.email = "Please enter a valid email address.";
  if (resumeUrl) {
    try { if (new URL(resumeUrl).protocol !== "https:") errors.resumeUrl = "The link must start with https://"; }
    catch { errors.resumeUrl = "Please enter a full link, starting with https://"; }
  }
  // Consent is a legal precondition for holding someone's details, not a nicety.
  if (input.consent !== true) errors.consent = "Please confirm you are happy for us to hold your details.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || !job.isPublished || job.status !== "OPEN") {
    return NextResponse.json({ message: "That role is no longer accepting applications." }, { status: 409 });
  }

  // Same message whether or not they have applied before — an applicant should
  // not be able to probe who is already in the database.
  const CONFIRMATION = "Thank you — your application has been received. We will be in touch if there is a fit.";

  try {
    await db.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: { email },
        // An existing record is NOT overwritten with form data; only missing
        // details are filled in, so a recruiter's notes survive a re-application.
        update: {
          phone: phone || undefined,
          resumeUrl: resumeUrl || undefined,
          consentAt: new Date(),
        },
        create: { name, email, phone: phone || null, resumeUrl: resumeUrl || null, source: "Careers site", consentAt: new Date(), notes: note || null },
      });

      const existing = await tx.application.findUnique({ where: { jobId_candidateId: { jobId, candidateId: candidate.id } } });
      if (existing) return; // Silently idempotent.

      const application = await tx.application.create({
        data: { jobId, candidateId: candidate.id, stage: "SOURCED", isInbound: true },
      });
      await tx.applicationEvent.create({
        data: { applicationId: application.id, fromStage: null, toStage: "SOURCED", actorId: null, note: "Applied through the careers site." },
      });
    });
  } catch (error) {
    console.error("Careers application failed", error);
    return NextResponse.json({ message: "We could not record your application. Please try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ message: CONFIRMATION });
}
