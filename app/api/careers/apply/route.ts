import { NextResponse } from "next/server";
import { captchaRejection } from "@/lib/captcha";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";
import { crossSiteRejection } from "@/lib/http/same-origin";
import { BUCKETS, rateLimitRejection } from "@/lib/rate-limit";

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
  const crossSite = crossSiteRejection(request.headers);
  if (crossSite) return crossSite;

  // Each accepted request writes candidate + application + event rows inside a
  // transaction, against a pool capped at 3 connections per instance, so an
  // unthrottled flood degrades the whole portal and not just this endpoint.
  const throttled = await rateLimitRejection(BUCKETS.apply, request);
  if (throttled) return throttled;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const captcha = await captchaRejection("apply", input.captchaToken);
  if (captcha) return captcha;

  // Free text is capped on the way in. Route handlers have no body-size limit
  // in Next, so without this a multi-megabyte `name` is stored verbatim.
  const jobId = String(input.jobId ?? "").slice(0, 100);
  const name = String(input.name ?? "").trim().slice(0, 200);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);
  const phone = String(input.phone ?? "").trim().slice(0, 50);
  const resumeUrl = String(input.resumeUrl ?? "").trim().slice(0, 2000);
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
      const existingCandidate = await tx.candidate.findUnique({ where: { email } });

      // Anyone can post any email address here, so an existing record must be
      // treated as belonging to someone else until proven otherwise: only
      // genuine blanks are filled in. `upsert` with `field || undefined` looks
      // like it does this but does not — Prisma reads `undefined` as "skip", so
      // a supplied value overwrote the stored one and a stranger could repoint
      // a live candidate's CV link at a URL of their choosing. `consentAt` is
      // likewise left alone: it records when *that person* gave consent, and
      // must not be refreshed by a third party.
      const candidate = existingCandidate
        ? await tx.candidate.update({
            where: { id: existingCandidate.id },
            data: {
              phone: existingCandidate.phone ?? (phone || null),
              resumeUrl: existingCandidate.resumeUrl ?? (resumeUrl || null),
            },
          })
        : await tx.candidate.create({
            data: { name, email, phone: phone || null, resumeUrl: resumeUrl || null, source: "Careers site", consentAt: new Date(), notes: note || null },
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
