import { CandidateManager } from "@/components/ats/candidate-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { STAGE_LABELS } from "@/lib/ats/pipeline";
import { resourceTypeOf } from "@/lib/ats/resource-type";
import { db } from "@/lib/db";

export const metadata = { title: "Candidate Pool" };

const money = (minor: number | null) =>
  minor === null ? "—" : `$ ${(minor / 100).toLocaleString("en-US")}`;

export default async function CandidatesPage() {
  const context = await requirePermission("candidate.view");

  const candidates = await db.candidate.findMany({
    include: {
      applications: {
        include: { job: { select: { title: true, reference: true } } },
      },
    },
    // Active first, then most recently added — archived records stay reachable
    // through the filter without crowding the top of the pool.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

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
        candidates={candidates.map((candidate) => ({
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
          ssn: candidate.ssn ? `•••-••-${candidate.ssn.slice(-4)}` : "—",
          benchStatus: candidate.benchStatus ?? (resourceTypeOf(candidate.source) === "GLOBAL" ? "Available / On Bench" : "Direct"),
          source: candidate.source,
          resourceType: resourceTypeOf(candidate.source),
          status: candidate.status,
          resumeUrl: candidate.resumeUrl,
          hasConsent: candidate.consentAt !== null,
          applications: candidate.applications.map((a) => `${a.job.title} (${STAGE_LABELS[a.stage]})`),
        }))}
        canManage={can(context, "candidate.manage")}
        canDraftContract={can(context, "contract.generate")}
      />
    </div>
  );
}
