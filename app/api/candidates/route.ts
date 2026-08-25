import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { resourceTypeOf, RESOURCE_TYPE } from "@/lib/ats/resource-type";
import { appOrigin } from "@/lib/app-origin";
import { sha256 } from "@/lib/crypto";
import { notifyLeadership, sendEmail } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const GLOBAL_SOURCES = ["LinkedIn", "Internal Sources", "Other"] as const;

function candidateKind(input: Record<string, unknown>): "GLOBAL" | "DEVELOPER" | "DIRECT" {
  const supplied = String(input.kind ?? "").trim().toUpperCase();
  if (["GLOBAL", "DEVELOPER", "DIRECT"].includes(supplied)) return supplied as "GLOBAL" | "DEVELOPER" | "DIRECT";
  return resourceTypeOf(String(input.source ?? "")) === RESOURCE_TYPE.GLOBAL ? "GLOBAL" : "DEVELOPER";
}

function marketingProfiles(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

/** CVs are LINKS, not uploads — this application stores no files. */
function urlProblem(value: string, label: string): string | undefined {
  if (!value) return undefined;
  try {
    if (new URL(value).protocol !== "https:") return `The ${label} must start with https://`;
  } catch { return `Please enter a full ${label}, starting with https://`; }
  return undefined;
}

export async function POST(request: Request) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const resumeUrl = String(input.resumeUrl ?? "").trim();
  const linkedinUrl = String(input.linkedinUrl ?? "").trim();
  const kind = candidateKind(input);
  const rawSource = String(input.source ?? (kind === "GLOBAL" ? "LinkedIn" : "Internal Sources")).trim();

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter the candidate's name.";
  if (!emailPattern.test(email)) errors.email = "Please enter a valid email address.";
  const resumeProblem = urlProblem(resumeUrl, "CV link");
  if (resumeProblem) errors.resumeUrl = resumeProblem;
  const linkedinProblem = urlProblem(linkedinUrl, "LinkedIn URL");
  if (linkedinProblem) errors.linkedinUrl = linkedinProblem;
  if (kind === "GLOBAL" && !GLOBAL_SOURCES.includes(rawSource as typeof GLOBAL_SOURCES[number])) {
    errors.source = "Choose LinkedIn, Internal Sources, or Other for a Global Candidate.";
  }

  if (await db.candidate.findUnique({ where: { email } })) errors.email = "A candidate with that email already exists.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const consentToken = kind === "GLOBAL" ? randomBytes(32).toString("base64url") : null;
  const created = await db.$transaction(async (tx) => {
    const isGlobal = kind === "GLOBAL";
    const technology = String(input.skills ?? input.techStack ?? "").trim();

    const candidate = await tx.candidate.create({
      data: {
        name, email,
        phone: String(input.phone ?? "").trim() || null,
        resumeUrl: resumeUrl || null,
        linkedinUrl: linkedinUrl || null,
        location: String(input.location ?? "").trim() || null,
        headline: String(input.headline ?? "").trim() || null,
        skills: technology || null,
        techStack: technology || null,
        visaType: isGlobal ? (String(input.visaType ?? "").trim() || null) : null,
        visaStatus: isGlobal ? (String(input.visaStatus ?? "Valid").trim() || null) : null,
        visaExpiry: isGlobal && input.visaExpiry ? new Date(String(input.visaExpiry)) : null,
        ssn: isGlobal ? (String(input.ssn ?? "").trim() || null) : null,
        address: isGlobal ? (String(input.address ?? "").trim() || null) : null,
        // Commission belongs to a procured C2C job, not the candidate profile.
        commissionPaid: null,
        benchStatus: isGlobal ? (String(input.benchStatus ?? "Available / On Bench").trim() || "Available / On Bench") : "Direct",
        source: rawSource,
        kind,
        addedById: context.user.id,
        noticePeriod: String(input.noticePeriod ?? "").trim() || null,
        notes: String(input.notes ?? "").trim() || null,
        // Compensation is agreed only in the contract letter's Monthly
        // Compensation field. Legacy candidate salary columns are retained
        // untouched for historical data, but new intake never writes them.
        // Global Candidates must complete the emailed consent flow. Other
        // candidate types retain the existing opt-in behaviour.
        consentAt: !isGlobal && input.consent === true ? new Date() : null,
        consentStatus: isGlobal ? "PENDING" : (input.consent === true ? "CONSENTED" : "NOT_REQUIRED"),
        consents: isGlobal && consentToken
          ? { create: { status: "PENDING", tokenHash: sha256(consentToken) } }
          : undefined,
        marketingProfiles: isGlobal && technology
          ? { create: marketingProfiles(technology).map((technology) => ({ technology })) }
          : undefined,
      },
    });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: isGlobal ? `New Global Candidate: ${candidate.name}` : `Developer added to Candidate Pool: ${candidate.name}`,
      body: isGlobal
        ? `${context.user.name} added ${candidate.name} from ${candidate.source}. Consent has been requested.`
        : `${context.user.name} added ${candidate.name} to the Candidate Pool.`,
      link: "/candidates",
    }, tx);
    await recordAudit({ actorId: context.user.id, action: "candidate.create", entityType: "Candidate", entityId: candidate.id, after: { name, email, kind, visaType: candidate.visaType, source: candidate.source, addedBy: context.user.id }, ipAddress: clientIp(request) }, tx);
    return candidate;
  });

  if (kind === "GLOBAL" && consentToken) {
    const link = `${appOrigin()}/consent/${encodeURIComponent(consentToken)}`;
    void sendEmail(
      [created.email],
      "Confirm Qonic Systems profile marketing consent",
      `Please confirm that Qonic Systems may use your documents and profile to procure jobs, market your profile, and notify you when a job is procured. Confirm your consent at the secure link below.`,
      link
    );
  } else if (kind === "DEVELOPER") {
    void sendEmail(
      [created.email],
      "You have been added to the Qonic Systems Candidate Pool",
      "You have been added to the Qonic Systems Candidate Pool. We will contact you about relevant delivery opportunities.",
      "/candidates"
    );
  }

  return NextResponse.json({
    message: kind === "GLOBAL"
      ? `${created.name} added. A consent email has been sent and their profile remains pending until they confirm.`
      : `${created.name} added to the Candidate Pool.`,
    id: created.id,
  });
}
