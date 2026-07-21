import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { toMinor } from "@/lib/money";
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
    const candidate = await tx.candidate.create({
      data: {
        name, email,
        phone: String(input.phone ?? "").trim() || null,
        resumeUrl: resumeUrl || null,
        linkedinUrl: linkedinUrl || null,
        location: String(input.location ?? "").trim() || null,
        headline: String(input.headline ?? "").trim() || null,
        skills: String(input.skills ?? "").trim() || null,
        source: String(input.source ?? "Direct").trim() || "Direct",
        noticePeriod: String(input.noticePeriod ?? "").trim() || null,
        notes: String(input.notes ?? "").trim() || null,
        currentSalary, expectedSalary,
        // Adding someone to the database is the point at which consent matters.
        consentAt: input.consent === true ? new Date() : null,
      },
    });
    await recordAudit({ actorId: context.user.id, action: "candidate.create", entityType: "Candidate", entityId: candidate.id, after: { name, email }, ipAddress: clientIp(request) }, tx);
    return candidate;
  });

  return NextResponse.json({ message: `${created.name} added to the talent pool.`, id: created.id });
}
