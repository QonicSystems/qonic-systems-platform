import { CandidateManager } from "@/components/ats/candidate-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { STAGE_LABELS } from "@/lib/ats/pipeline";
import { resourceTypeOf } from "@/lib/ats/resource-type";
import { db } from "@/lib/db";

export const metadata = { title: "Candidate Pool" };

export default async function CandidatesPage() {
  const context = await requirePermission("candidate.view");
  // A candidate's real contract status is HR/leadership scope — a plain
  // candidate.view holder (e.g. a recruiter) shouldn't newly see contract
  // internals just because the pool page grew a status badge.
  const canViewContractStatus = can(context, "contract.view_all");

  const [candidates, activeAssignments] = await Promise.all([
    db.candidate.findMany({
      include: {
        applications: {
          include: { job: { select: { title: true, reference: true } } },
        },
        linkedUser: { select: { id: true, name: true } },
        addedBy: { select: { name: true } },
        marketingProfiles: { where: { isActive: true }, select: { technology: true } },
      },
      // Active first, then most recently added — archived records stay reachable
      // through the filter without crowding the top of the pool.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.projectAssignment.findMany({
      where: { project: { status: "ACTIVE" } },
      include: { project: { select: { name: true, code: true } } },
    }),
  ]);

  // "Draft Contract" on this page is a static button label for CREATING a
  // letter — it used to read the same whether one already existed or not.
  // One row per linked user's most recent letter, so a candidate who already
  // has a contract shows its real status instead.
  const linkedUserIds = candidates.map((c) => c.linkedUser?.id).filter((id): id is string => Boolean(id));
  const latestContracts = canViewContractStatus && linkedUserIds.length > 0
    ? await db.contractLetter.findMany({
        where: { subjectUserId: { in: linkedUserIds } },
        orderBy: { updatedAt: "desc" },
        distinct: ["subjectUserId"],
        select: { id: true, subjectUserId: true, status: true },
      })
    : [];
  const contractByUserId = new Map(latestContracts.map((c) => [c.subjectUserId, c]));

  // Keyed on the real FK, not on a lowercased email. Matching Candidate to User
  // by email string is the pattern the candidate/user sync was removed for: it
  // has no audit trail and silently attaches one person's project allocations
  // to a different person who happens to share an address. `linkedUserId` is
  // written once, deliberately, when the candidate becomes an employee.
  const assignmentByUserId = new Map<string, Array<{ projectName: string; projectCode: string; allocationPercent: number }>>();
  for (const a of activeAssignments) {
    const list = assignmentByUserId.get(a.userId) ?? [];
    list.push({
      projectName: a.project.name,
      projectCode: a.project.code,
      allocationPercent: a.allocationPercent,
    });
    assignmentByUserId.set(a.userId, list);
  }

  const activeCount = candidates.filter((candidate) => candidate.status === "ACTIVE").length;
  const archivedCount = candidates.length - activeCount;

  return (
    <div className="portal-page">
      <header className="portal-page-head">
        <p className="eyebrow">Talent &amp; Delivery</p>
        <h1 className="portal-title">Candidate Pool</h1>
        <p className="portal-lead">
          {activeCount} active candidate{activeCount === 1 ? "" : "s"} across bench, project
          allocations, and recruitment pipelines
          {archivedCount > 0 ? ` · ${archivedCount} archived` : ""}.
        </p>
      </header>

      <CandidateManager
        candidates={candidates.map((candidate) => {
          const allocations = candidate.linkedUserId ? assignmentByUserId.get(candidate.linkedUserId) ?? [] : [];
          return {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone ?? "",
            headline: candidate.headline ?? "",
            location: candidate.location ?? "",
            techStack: candidate.techStack ?? candidate.skills ?? "",
            marketingProfiles: candidate.marketingProfiles.map((profile) => profile.technology),
            visaType: candidate.visaType ?? "",
            visaStatus: candidate.visaStatus ?? (candidate.visaType ? "Valid" : ""),
            visaExpiry: candidate.visaExpiry ? candidate.visaExpiry.toISOString().slice(0, 10) : "",
            ssn: candidate.ssn ? `•••-••-${candidate.ssn.slice(-4)}` : "—",
            rawSsn: candidate.ssn ?? "",
            address: candidate.address ?? "",
            benchStatus: candidate.benchStatus ?? (resourceTypeOf(candidate.source) === "GLOBAL" ? "Available / On Bench" : "Available / Ready to Deploy"),
            projectAllocations: allocations,
            source: candidate.source,
            resourceType: candidate.kind === "GLOBAL" ? "GLOBAL" : candidate.kind === "DEVELOPER" ? "EMPLOYEE_DEV" : resourceTypeOf(candidate.source),
            noticePeriod: candidate.noticePeriod ?? "",
            notes: candidate.notes ?? "",
            status: candidate.status,
            resumeUrl: candidate.resumeUrl,
            linkedinUrl: candidate.linkedinUrl ?? "",
            hasConsent: candidate.consentStatus === "CONSENTED",
            consentStatus: candidate.consentStatus,
            addedBy: candidate.addedBy?.name ?? "System / legacy record",
            applications: candidate.applications.map((a) => `${a.job.title} (${STAGE_LABELS[a.stage]})`),
            linkedUserName: candidate.linkedUser?.name ?? null,
            contractStatus: candidate.linkedUser ? contractByUserId.get(candidate.linkedUser.id)?.status ?? null : null,
            contractId: candidate.linkedUser ? contractByUserId.get(candidate.linkedUser.id)?.id ?? null : null,
          };
        })}
        canManage={can(context, "candidate.manage")}
        canDraftContract={can(context, "contract.generate")}
        // Creating the staff account is account administration, not recruitment
        // — the endpoint it calls guards on the same permission.
        canCreateAccount={can(context, "user.manage")}
      />
    </div>
  );
}
