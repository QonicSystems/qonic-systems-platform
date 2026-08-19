import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelineBoard } from "@/components/ats/pipeline-board";
import { can, requirePermission } from "@/lib/auth/guard";
import { PIPELINE, STAGE_LABELS, availableStages, jobAgeing } from "@/lib/ats/pipeline";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/status-chip";

export const metadata = { title: "Pipeline" };

const dateTime = (value: Date) =>
  value.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });

export default async function JobPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePermission("job.view");
  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    include: {
      client: true,
      applications: {
        include: {
          candidate: true,
          interviews: { include: { interviewer: { select: { name: true } } }, orderBy: { scheduledAt: "desc" } },
          // The append-only stage history. It has been written since day one and
          // was never read back anywhere — the board now shows it per candidate.
          events: { orderBy: { createdAt: "desc" } },
          placement: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!job) notFound();

  const { days, overSla } = jobAgeing(job);

  // ApplicationEvent.actorId has no relation, so names are resolved in one pass
  // rather than a query per event.
  const actorIds = [...new Set(job.applications.flatMap((a) => a.events.map((e) => e.actorId).filter((v): v is string => Boolean(v))))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const [candidates, interviewers] = await Promise.all([
    db.candidate.findMany({
      where: { NOT: { applications: { some: { jobId: id } } }, status: "ACTIVE" },
      select: { id: true, name: true, headline: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

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
        interviewList: application.interviews.map((interview) => ({
          id: interview.id,
          scheduledAt: dateTime(interview.scheduledAt),
          durationMins: interview.durationMins,
          kind: interview.kind,
          location: interview.location ?? "",
          interviewer: interview.interviewer?.name ?? "",
          outcome: interview.outcome,
          score: interview.score,
          feedback: interview.feedback ?? "",
        })),
        history: application.events.map((event) => ({
          id: event.id,
          from: event.fromStage ? STAGE_LABELS[event.fromStage] : null,
          to: STAGE_LABELS[event.toStage],
          actor: event.actorId ? actorName.get(event.actorId) ?? "Someone" : "System",
          note: event.note ?? "",
          at: dateTime(event.createdAt),
        })),
      }))}
      addableCandidates={candidates.map((c) => ({ id: c.id, label: c.headline ? `${c.name} — ${c.headline}` : c.name }))}
      interviewers={interviewers}
      canManage={can(context, "candidate.manage")}
      canPlace={can(context, "placement.manage")}
    />

    <p><Link className="text-link" href="/jobs">Back to jobs</Link></p>
  </div>;
}
