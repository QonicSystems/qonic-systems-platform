import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelineBoard } from "@/components/ats/pipeline-board";
import { can, requirePermission } from "@/lib/auth/guard";
import { PIPELINE, STAGE_LABELS, availableStages, jobAgeing } from "@/lib/ats/pipeline";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/status-chip";

export const metadata = { title: "Pipeline" };

export default async function JobPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePermission("job.view");
  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    include: {
      client: true,
      applications: {
        include: { candidate: true, interviews: { orderBy: { scheduledAt: "desc" } }, placement: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!job) notFound();

  const { days, overSla } = jobAgeing(job);
  const candidates = await db.candidate.findMany({
    where: { NOT: { applications: { some: { jobId: id } } } },
    select: { id: true, name: true, headline: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">{job.reference} · {job.client.name}</p>
      <h1 className="portal-title">{job.title}</h1>
      <p className="portal-lead">
        <StatusChip status={job.status} />
        {" "}{job.openings} opening{job.openings === 1 ? "" : "s"} · open {days} day{days === 1 ? "" : "s"}
        {overSla && <strong className="text-over"> · past its {job.slaDays}-day SLA</strong>}
        {job.salaryMin && job.salaryMax ? ` · ${formatMoney(job.salaryMin, job.currency)} – ${formatMoney(job.salaryMax, job.currency)}` : ""}
      </p>
    </header>

    <PipelineBoard
      jobId={job.id}
      stages={PIPELINE.map((stage) => ({ key: stage, label: STAGE_LABELS[stage] }))}
      applications={job.applications.map((application) => ({
        id: application.id,
        candidateName: application.candidate.name,
        candidateHeadline: application.candidate.headline ?? "",
        resumeUrl: application.candidate.resumeUrl,
        stage: application.stage,
        interviews: application.interviews.length,
        lastScore: application.interviews.find((i) => i.score !== null)?.score ?? null,
        placed: Boolean(application.placement),
        outcomeReason: application.outcomeReason,
        available: availableStages(context, application.stage).map((stage) => ({ key: stage, label: STAGE_LABELS[stage] })),
      }))}
      addableCandidates={candidates.map((c) => ({ id: c.id, label: c.headline ? `${c.name} — ${c.headline}` : c.name }))}
      canManage={can(context, "candidate.manage")}
      canPlace={can(context, "placement.manage")}
    />

    <p><Link className="text-link" href="/jobs">Back to jobs</Link></p>
  </div>;
}
