import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { renderGlobalCandidateAgreementPdf } from "@/lib/global-agreements/pdf";
import {
  type GlobalCandidateAgreementPayload,
  validateGlobalCandidateAgreementInput,
} from "@/lib/global-agreements/payload";
import { notifyLeadership, sendEmail } from "@/lib/notify";
import { nextReferenceFrom, referenceWhere } from "@/lib/reference";

export const runtime = "nodejs";

async function nextReference() {
  const year = new Date().getFullYear();
  const existing = await db.globalCandidateAgreement.findMany({
    where: { OR: referenceWhere("reference", "GA", year) },
    select: { reference: true },
  });
  return nextReferenceFrom(existing.map((agreement) => agreement.reference), "GA", year);
}

/**
 * Issues the reusable representation agreement for a Global Candidate.
 *
 * This intentionally does not create a User or touch the employment-contract
 * workflow. A Global Candidate stays external even after they acknowledge it.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("contract.release");
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid agreement." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const candidateId = String(input.candidateId ?? "").trim();
  const { data, errors } = validateGlobalCandidateAgreementInput(input);
  if (!candidateId) errors.candidateId = "Please choose a Global Candidate.";
  if (!data || Object.keys(errors).length > 0) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true, name: true, email: true, kind: true, status: true, consentStatus: true,
      location: true, skills: true, techStack: true, visaType: true, visaStatus: true, visaExpiry: true,
    },
  });
  if (!candidate || candidate.kind !== "GLOBAL") {
    return NextResponse.json({ message: "That Global Candidate could not be found." }, { status: 404 });
  }
  if (candidate.status !== "ACTIVE") {
    return NextResponse.json({ message: "Only an active Global Candidate can receive an agreement." }, { status: 409 });
  }
  if (candidate.consentStatus !== "CONSENTED") {
    return NextResponse.json({ message: "The candidate must first consent to profile marketing before an agreement can be issued." }, { status: 409 });
  }

  const existing = await db.globalCandidateAgreement.findFirst({
    where: { candidateId, status: { in: ["SENT", "ACKNOWLEDGED"] } },
    select: { reference: true, status: true },
  });
  if (existing) {
    return NextResponse.json({
      message: `${existing.reference} is already ${existing.status.toLowerCase()} for this candidate. Revoke it before issuing a replacement.`,
    }, { status: 409 });
  }

  const now = new Date();
  const rawToken = randomBytes(32).toString("base64url");
  const payload: GlobalCandidateAgreementPayload = {
    version: "global-candidate-master-v1",
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    location: candidate.location ?? "",
    skills: candidate.skills ?? candidate.techStack ?? "",
    visaType: candidate.visaType ?? "",
    visaStatus: candidate.visaStatus ?? "",
    visaExpiry: candidate.visaExpiry?.toISOString() ?? "",
    ...data,
  };

  const agreement = await db.$transaction(async (tx) => {
    const created = await tx.globalCandidateAgreement.create({
      data: {
        reference: await nextReference(),
        candidateId,
        recipientEmail: candidate.email,
        status: "SENT",
        payload,
        authorUserId: context.user.id,
        releasedById: context.user.id,
        releasedAt: now,
        acknowledgementTokenHash: sha256(rawToken),
        acknowledgementExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: `Global Candidate agreement issued: ${candidate.name}`,
      body: `${created.reference} was sent to ${candidate.email} by ${context.user.name}.`,
      link: "/candidates",
    }, tx);
    await recordAudit({
      actorId: context.user.id,
      action: "global_agreement.issue",
      entityType: "GlobalCandidateAgreement",
      entityId: created.id,
      after: { reference: created.reference, candidateId, recipientEmail: candidate.email },
      ipAddress: clientIp(request),
    }, tx);
    return created;
  });

  let emailSent = false;
  const acknowledgementUrl = `${appOrigin()}/global-agreements/acknowledge/${encodeURIComponent(rawToken)}`;
  try {
    const pdf = await renderGlobalCandidateAgreementPdf({ reference: agreement.reference, issuedAt: now, payload });
    emailSent = await sendEmail(
      [candidate.email],
      `Global Candidate agreement ${agreement.reference}`,
      [
        `Dear ${candidate.name},`,
        "",
        "Please find your QONIC consulting Global Candidate master agreement attached.",
        "It covers profile representation and commission terms only; it is not an employment agreement and does not create a Qonic Systems account.",
        "",
        `Review it, then record your response using this one-time link before ${agreement.acknowledgementExpiresAt?.toLocaleDateString("en-GB", { timeZone: "UTC" }) ?? "it expires"}:`,
        acknowledgementUrl,
      ].join("\n"),
      acknowledgementUrl,
      [{ filename: `${agreement.reference}.pdf`, content: pdf, contentType: "application/pdf" }],
    );
  } catch (error) {
    console.error("Global Candidate agreement email delivery error:", error);
  }

  return NextResponse.json({
    message: emailSent
      ? `${agreement.reference} was issued with its PDF attachment.`
      : `${agreement.reference} was issued, but email delivery is not configured or failed. Download the PDF and share it securely.`,
    id: agreement.id,
    reference: agreement.reference,
    emailSent,
    // SMTP can be deliberately disabled in a local/private deployment. In
    // that case the releaser can still give the candidate the exact one-time
    // link; it is never returned after a successful email delivery.
    manualAcknowledgementUrl: emailSent ? null : acknowledgementUrl,
  }, { status: 201 });
}
