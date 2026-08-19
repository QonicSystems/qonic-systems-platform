import { CandidateManager } from "@/components/ats/candidate-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { STAGE_LABELS } from "@/lib/ats/pipeline";
import { resourceTypeOf } from "@/lib/ats/resource-type";
import { syncCandidateAndUsers } from "@/lib/ats/sync";
import { db } from "@/lib/db";

export const metadata = { title: "Candidate Pool" };

const money = (minor: number | null) =>
  minor === null ? "—" : `$ ${(minor / 100).toLocaleString("en-US")}`;

export default async function CandidatesPage() {
  const context = await requirePermission("candidate.view");

  // Sync any staff users into Candidate pool
  await syncCandidateAndUsers();

  const [candidates, activeAssignments] = await Promise.all([
    db.candidate.findMany({
      include: {
        applications: {
          include: { job: { select: { title: true, reference: true } } },
        },
      },
      // Active first, then most recently added — archived records stay reachable
      // through the filter without crowding the top of the pool.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.projectAssignment.findMany({
      where: { project: { status: "ACTIVE" } },
      include: {
        project: { select: { name: true, code: true } },
        user: { select: { email: true } },
      },
    }),
  ]);

  const assignmentByEmail = new Map<string, Array<{ projectName: string; projectCode: string; allocationPercent: number }>>();
  for (const a of activeAssignments) {
    if (!a.user?.email) continue;
    const email = a.user.email.toLowerCase().trim();
    const list = assignmentByEmail.get(email) ?? [];
    list.push({
      projectName: a.project.name,
      projectCode: a.project.code,
      allocationPercent: a.allocationPercent,
    });
    assignmentByEmail.set(email, list);
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
          const email = candidate.email.toLowerCase().trim();
          const allocations = assignmentByEmail.get(email) ?? [];
          return {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone ?? "",
            headline: candidate.headline ?? "",
            location: candidate.location ?? "",
            techStack: candidate.techStack ?? candidate.skills ?? "",
            visaType: candidate.visaType ?? "",
            visaStatus: candidate.visaStatus ?? (candidate.visaType ? "Valid" : ""),
            commissionPaid: money(candidate.commissionPaid),
            rawCommissionPaid: candidate.commissionPaid !== null ? String(candidate.commissionPaid / 100) : "",
            ssn: candidate.ssn ? `•••-••-${candidate.ssn.slice(-4)}` : "—",
            rawSsn: candidate.ssn ?? "",
            address: candidate.address ?? "",
            benchStatus: candidate.benchStatus ?? (resourceTypeOf(candidate.source) === "GLOBAL" ? "Available / On Bench" : "Available / Ready to Deploy"),
            projectAllocations: allocations,
            source: candidate.source,
            resourceType: resourceTypeOf(candidate.source),
            noticePeriod: candidate.noticePeriod ?? "",
            expectedSalary: candidate.expectedSalary !== null ? String(candidate.expectedSalary / 100) : "",
            currentSalary: candidate.currentSalary !== null ? String(candidate.currentSalary / 100) : "",
            notes: candidate.notes ?? "",
            status: candidate.status,
            resumeUrl: candidate.resumeUrl,
            linkedinUrl: candidate.linkedinUrl ?? "",
            hasConsent: candidate.consentAt !== null,
            applications: candidate.applications.map((a) => `${a.job.title} (${STAGE_LABELS[a.stage]})`),
          };
        })}
        canManage={can(context, "candidate.manage")}
        canDraftContract={can(context, "contract.generate")}
      />
    </div>
  );
}
