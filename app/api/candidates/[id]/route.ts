import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { toMinor } from "@/lib/money";
import { resourceTypeOf, RESOURCE_TYPE } from "@/lib/ats/resource-type";
import { syncCandidateAndUsers } from "@/lib/ats/sync";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function urlProblem(value: string, label: string): string | undefined {
  if (!value) return undefined;
  try {
    if (new URL(value).protocol !== "https:") return `The ${label} must start with https://`;
  } catch { return `Please enter a full ${label}, starting with https://`; }
  return undefined;
}

/** Update candidate details */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.candidate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "That candidate no longer exists." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const name = String(input.name ?? existing.name).trim();
  const email = String(input.email ?? existing.email).trim().toLowerCase();
  const resumeUrl = typeof input.resumeUrl === "string" ? input.resumeUrl.trim() : (existing.resumeUrl ?? "");
  const linkedinUrl = typeof input.linkedinUrl === "string" ? input.linkedinUrl.trim() : (existing.linkedinUrl ?? "");

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter the candidate's name.";
  if (!emailPattern.test(email)) errors.email = "Please enter a valid email address.";
  const resumeProblem = urlProblem(resumeUrl, "CV link");
  if (resumeProblem) errors.resumeUrl = resumeProblem;
  const linkedinProblem = urlProblem(linkedinUrl, "LinkedIn URL");
  if (linkedinProblem) errors.linkedinUrl = linkedinProblem;

  const currentSalary = input.currentSalary !== undefined ? toMinor(String(input.currentSalary ?? "")) : existing.currentSalary;
  const expectedSalary = input.expectedSalary !== undefined ? toMinor(String(input.expectedSalary ?? "")) : existing.expectedSalary;
  if (Number.isNaN(currentSalary)) errors.currentSalary = "Enter the salary as a number.";
  if (Number.isNaN(expectedSalary)) errors.expectedSalary = "Enter the salary as a number.";

  if (email !== existing.email) {
    const clash = await db.candidate.findUnique({ where: { email } });
    if (clash && clash.id !== existing.id) errors.email = "Another candidate already uses that email address.";
  }

  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const rawSource = String(input.source ?? existing.source).trim() || "Direct";
  const isGlobal = resourceTypeOf(rawSource) === RESOURCE_TYPE.GLOBAL;

  const updated = await db.$transaction(async (tx) => {
    const candidate = await tx.candidate.update({
      where: { id },
      data: {
        name,
        email,
        phone: typeof input.phone === "string" ? (input.phone.trim() || null) : existing.phone,
        resumeUrl: resumeUrl || null,
        linkedinUrl: linkedinUrl || null,
        location: typeof input.location === "string" ? (input.location.trim() || null) : existing.location,
        headline: typeof input.headline === "string" ? (input.headline.trim() || null) : existing.headline,
        skills: typeof input.techStack === "string" ? input.techStack.trim() : (typeof input.skills === "string" ? input.skills.trim() : existing.skills),
        techStack: typeof input.techStack === "string" ? input.techStack.trim() : existing.techStack,
        visaType: isGlobal ? (String(input.visaType ?? existing.visaType ?? "").trim() || null) : null,
        visaStatus: isGlobal ? (String(input.visaStatus ?? existing.visaStatus ?? "Valid").trim() || null) : null,
        visaExpiry: isGlobal && input.visaExpiry ? new Date(String(input.visaExpiry)) : (isGlobal ? existing.visaExpiry : null),
        ssn: isGlobal ? (String(input.ssn ?? existing.ssn ?? "").trim() || null) : null,
        address: isGlobal ? (String(input.address ?? existing.address ?? "").trim() || null) : null,
        commissionPaid: isGlobal && input.commissionPaid !== undefined ? toMinor(String(input.commissionPaid)) : (isGlobal ? existing.commissionPaid : null),
        benchStatus: String(input.benchStatus ?? existing.benchStatus ?? (isGlobal ? "Available / On Bench" : "Available / Ready to Deploy")).trim(),
        source: rawSource,
        noticePeriod: typeof input.noticePeriod === "string" ? (input.noticePeriod.trim() || null) : existing.noticePeriod,
        notes: typeof input.notes === "string" ? (input.notes.trim() || null) : existing.notes,
        currentSalary,
        expectedSalary,
        status: typeof input.status === "string" && ["ACTIVE", "ARCHIVED"].includes(input.status) ? (input.status as "ACTIVE" | "ARCHIVED") : existing.status,
      },
    });

    await recordAudit({
      actorId: context.user.id,
      action: "candidate.update",
      entityType: "Candidate",
      entityId: candidate.id,
      before: { name: existing.name, email: existing.email, source: existing.source },
      after: { name, email, source: candidate.source },
      ipAddress: clientIp(request),
    }, tx);

    return candidate;
  });

  await syncCandidateAndUsers();

  return NextResponse.json({ message: `${updated.name} updated successfully.`, id: updated.id });
}

/** Archive or delete a candidate */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.candidate.findUnique({ where: { id }, include: { applications: true } });
  if (!existing) return NextResponse.json({ message: "That candidate no longer exists." }, { status: 404 });

  if (existing.applications.length > 0) {
    // If applications exist, move to ARCHIVED
    await db.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id }, data: { status: "ARCHIVED" } });
      await recordAudit({ actorId: context.user.id, action: "candidate.archive", entityType: "Candidate", entityId: id, ipAddress: clientIp(request) }, tx);
    });
    return NextResponse.json({ message: `${existing.name} has been archived.` });
  }

  await db.$transaction(async (tx) => {
    // A matching staff account is archived, never hard-deleted, here — same
    // principle the app applies everywhere else ("removal is refused for
    // anyone with contract letters on record; deactivate instead" —
    // lib/auth/authority.ts). A naive delete used to sit here and silently
    // do nothing whenever the account had contract letters, time entries, or
    // other records referencing it, leaving an orphaned account with no
    // audit trail explaining why. Permanently purging an account, when that
    // is genuinely wanted, is its own deliberate, CEO-only action —
    // DELETE /api/admin/users/[id] — not a side effect of deleting a candidate.
    const linkedUser = await tx.user.findFirst({
      where: { email: { equals: existing.email, mode: "insensitive" }, role: { key: { notIn: ["ceo", "co_founder"] } }, status: "ACTIVE" },
    });
    if (linkedUser) {
      await tx.user.update({ where: { id: linkedUser.id }, data: { status: "ARCHIVED" } });
      await tx.session.deleteMany({ where: { userId: linkedUser.id } });
      await recordAudit({
        actorId: context.user.id, action: "user.deactivate", entityType: "User", entityId: linkedUser.id,
        before: { status: "ACTIVE" }, after: { status: "ARCHIVED", reason: "linked candidate deleted" },
        ipAddress: clientIp(request),
      }, tx);
    }

    await tx.candidate.delete({ where: { id } });
    await recordAudit({ actorId: context.user.id, action: "candidate.delete", entityType: "Candidate", entityId: id, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `${existing.name} deleted.` });
}
