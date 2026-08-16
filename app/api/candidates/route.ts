import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { toMinor } from "@/lib/money";
import { resourceTypeOf, RESOURCE_TYPE } from "@/lib/ats/resource-type";
import { db } from "@/lib/db";

export const runtime = "nodejs";

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
  const currentSalary = toMinor(String(input.currentSalary ?? ""));
  const expectedSalary = toMinor(String(input.expectedSalary ?? ""));

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter the candidate's name.";
  if (!emailPattern.test(email)) errors.email = "Please enter a valid email address.";
  const resumeProblem = urlProblem(resumeUrl, "CV link");
  if (resumeProblem) errors.resumeUrl = resumeProblem;
  const linkedinProblem = urlProblem(linkedinUrl, "LinkedIn URL");
  if (linkedinProblem) errors.linkedinUrl = linkedinProblem;
  if (Number.isNaN(currentSalary)) errors.currentSalary = "Enter the salary as a number.";
  if (Number.isNaN(expectedSalary)) errors.expectedSalary = "Enter the salary as a number.";

  if (await db.candidate.findUnique({ where: { email } })) errors.email = "A candidate with that email already exists.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const created = await db.$transaction(async (tx) => {
    const rawSource = String(input.source ?? "Direct").trim() || "Direct";
    const isGlobal = resourceTypeOf(rawSource) === RESOURCE_TYPE.GLOBAL;

    const candidate = await tx.candidate.create({
      data: {
        name, email,
        phone: String(input.phone ?? "").trim() || null,
        resumeUrl: resumeUrl || null,
        linkedinUrl: linkedinUrl || null,
        location: String(input.location ?? "").trim() || null,
        headline: String(input.headline ?? "").trim() || null,
        skills: String(input.skills ?? input.techStack ?? "").trim() || null,
        techStack: String(input.techStack ?? input.skills ?? "").trim() || null,
        visaType: isGlobal ? (String(input.visaType ?? "").trim() || null) : null,
        visaStatus: isGlobal ? (String(input.visaStatus ?? "Valid").trim() || null) : null,
        visaExpiry: isGlobal && input.visaExpiry ? new Date(String(input.visaExpiry)) : null,
        ssn: isGlobal ? (String(input.ssn ?? "").trim() || null) : null,
        address: isGlobal ? (String(input.address ?? "").trim() || null) : null,
        commissionPaid: isGlobal && input.commissionPaid ? toMinor(String(input.commissionPaid)) : null,
        benchStatus: isGlobal ? (String(input.benchStatus ?? "Available / On Bench").trim() || "Available / On Bench") : "Direct",
        source: rawSource,
        noticePeriod: String(input.noticePeriod ?? "").trim() || null,
        notes: String(input.notes ?? "").trim() || null,
        currentSalary, expectedSalary,
        // Adding someone to the database is the point at which consent matters.
        consentAt: input.consent === true ? new Date() : null,
      },
    });
    await recordAudit({ actorId: context.user.id, action: "candidate.create", entityType: "Candidate", entityId: candidate.id, after: { name, email, visaType: candidate.visaType, source: candidate.source }, ipAddress: clientIp(request) }, tx);
    return candidate;
  });

  return NextResponse.json({ message: `${created.name} added to the talent pool.`, id: created.id });
}
