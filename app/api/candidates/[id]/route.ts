import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { isLeadershipRank } from "@/lib/auth/roles";
import { appOrigin } from "@/lib/app-origin";
import { sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/notify";
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

  if (email !== existing.email) {
    const clash = await db.candidate.findUnique({ where: { email } });
    if (clash && clash.id !== existing.id) errors.email = "Another candidate already uses that email address.";
  }

  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const kind = String(input.kind ?? existing.kind).trim().toUpperCase();
  const isGlobal = kind === "GLOBAL";
  const rawSource = String(input.source ?? existing.source).trim() || "Direct";
  if (!["GLOBAL", "DEVELOPER", "DIRECT"].includes(kind)) errors.kind = "Please choose a candidate type.";
  if (isGlobal && !["LinkedIn", "Internal Sources", "Other"].includes(rawSource)) {
    errors.source = "Choose LinkedIn, Internal Sources, or Other for a Global Candidate.";
  }

  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  // Treat a conversion to Global (and legacy Global records that predate the
  // consent model) exactly like a new Global Candidate intake.
  const needsConsentRequest = isGlobal && (existing.kind !== "GLOBAL" || existing.consentStatus === "NOT_REQUIRED");
  const consentToken = needsConsentRequest ? randomBytes(32).toString("base64url") : null;
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
        // Retained only for historical records; new commercial commission is
        // configured on the Client/job where it can reconcile to invoices.
        commissionPaid: existing.commissionPaid,
        benchStatus: String(input.benchStatus ?? existing.benchStatus ?? (isGlobal ? "Available / On Bench" : "Available / Ready to Deploy")).trim(),
        source: rawSource,
        kind: kind as "GLOBAL" | "DEVELOPER" | "DIRECT",
        consentStatus: needsConsentRequest ? "PENDING" : existing.consentStatus,
        consentAt: needsConsentRequest ? null : existing.consentAt,
        consents: consentToken
          ? { create: { status: "PENDING", tokenHash: sha256(consentToken) } }
          : undefined,
        noticePeriod: typeof input.noticePeriod === "string" ? (input.noticePeriod.trim() || null) : existing.noticePeriod,
        notes: typeof input.notes === "string" ? (input.notes.trim() || null) : existing.notes,
        // Candidate compensation is no longer editable here. The accepted
        // contract letter's Monthly Compensation is the single live source.
        status: typeof input.status === "string" && ["ACTIVE", "ARCHIVED"].includes(input.status) ? (input.status as "ACTIVE" | "ARCHIVED") : existing.status,
      },
    });

    if (candidate.kind === "GLOBAL" && (typeof input.techStack === "string" || existing.kind !== "GLOBAL")) {
      const profileSource = typeof input.techStack === "string" ? input.techStack : (candidate.techStack ?? candidate.skills ?? "");
      const technologies = [...new Set(profileSource.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 30);
      await tx.candidateMarketingProfile.deleteMany({ where: { candidateId: candidate.id } });
      if (technologies.length > 0) {
        await tx.candidateMarketingProfile.createMany({ data: technologies.map((technology) => ({ candidateId: candidate.id, technology })) });
      }
    }

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

  if (consentToken) {
    void sendEmail(
      [updated.email],
      "Confirm Qonic Systems profile marketing consent",
      "Please confirm that Qonic Systems may use your documents and profile to procure jobs, market your profile, and notify you when a job is procured. Confirm your consent at the secure link below.",
      `${appOrigin()}/consent/${encodeURIComponent(consentToken)}`
    );
  }

  return NextResponse.json({
    message: consentToken
      ? `${updated.name} is now a Global Candidate. A consent email has been sent.`
      : `${updated.name} updated successfully.`,
    id: updated.id,
  });
}

/** Archive or delete a candidate */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  const existing = await db.candidate.findUnique({ where: { id }, include: { applications: true, linkedUser: { include: { role: true } } } });
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
    // A linked staff account is archived, never hard-deleted, here — same
    // principle the app applies everywhere else ("removal is refused for
    // anyone with contract letters on record; deactivate instead" —
    // lib/auth/authority.ts). A naive delete used to sit here and silently
    // do nothing whenever the account had contract letters, time entries, or
    // other records referencing it, leaving an orphaned account with no
    // audit trail explaining why. Permanently purging an account, when that
    // is genuinely wanted, is its own deliberate, CEO-only action —
    // DELETE /api/admin/users/[id] — not a side effect of deleting a candidate.
    // The link is a real FK (Candidate.linkedUserId), written only by the
    // deliberate "Create Employee Account" action — no more guessing by email,
    // so an unlinked candidate's deletion never touches any User account,
    // however similar the names or emails look.
    const linkedUser = existing.linkedUser && !isLeadershipRank(existing.linkedUser.role.rank) && existing.linkedUser.status === "ACTIVE"
      ? existing.linkedUser
      : null;
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
