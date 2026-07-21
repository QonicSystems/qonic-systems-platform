import { CandidateManager } from "@/components/ats/candidate-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { STAGE_LABELS } from "@/lib/ats/pipeline";
import { db } from "@/lib/db";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage() {
  const context = await requirePermission("candidate.view");

  const candidates = await db.candidate.findMany({
    include: { applications: { include: { job: { select: { title: true, reference: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Recruitment</p>
      <h1 className="portal-title">Talent Pool</h1>
      <p className="portal-lead">{candidates.length} candidate{candidates.length === 1 ? "" : "s"} on file.</p>
    </header>

    <CandidateManager
      candidates={candidates.map((candidate) => ({
        id: candidate.id, name: candidate.name, email: candidate.email,
        headline: candidate.headline ?? "", location: candidate.location ?? "",
        skills: candidate.skills ?? "", source: candidate.source,
        resumeUrl: candidate.resumeUrl,
        hasConsent: candidate.consentAt !== null,
        applications: candidate.applications.map((a) => `${a.job.title} (${STAGE_LABELS[a.stage]})`),
      }))}
      canManage={can(context, "candidate.manage")}
    />
  </div>;
}
