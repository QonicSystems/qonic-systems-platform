import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Dashboard" };

const shortDate = (value: Date) =>
  value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const context = await requireAuth();
  const denied = (await searchParams).denied === "1";
  const isExecutive = context.role.isSuperAdmin || context.role.key === "co_founder";

  // Data fetching
  const [
    teamCount,
    candidateCount,
    activeJobsCount,
    pipelineGroup,
    projects,
    recentContracts,
    myAssignments,
  ] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.candidate.count(),
    db.job.count({ where: { status: { in: ["OPEN", "DRAFT"] } } }),
    db.application.groupBy({
      by: ["stage"],
      _count: { _all: true },
    }),
    db.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        client: { select: { name: true, code: true } },
        manager: { select: { name: true } },
        timeEntries: { select: { minutes: true, billable: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.contractLetter.findMany({
      where: isExecutive ? {} : { subjectUserId: context.user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { subject: { select: { name: true, email: true } } },
    }),
    db.projectAssignment.findMany({
      where: { userId: context.user.id },
      include: { project: { include: { client: true } } },
    }),
  ]);

  // Transform pipeline counts
  const stageMap = Object.fromEntries(pipelineGroup.map((g) => [g.stage, g._count._all]));
  const pipelineStages = [
    { label: "Sourced", key: "SOURCED", count: stageMap["SOURCED"] ?? 0, color: "bg-slate-100 text-slate-800 border-slate-300" },
    { label: "Screened", key: "SCREENED", count: stageMap["SCREENED"] ?? 0, color: "bg-blue-50 text-blue-800 border-blue-200" },
    { label: "Submitted", key: "SUBMITTED", count: stageMap["SUBMITTED"] ?? 0, color: "bg-purple-50 text-purple-800 border-purple-200" },
    { label: "Interview", key: "INTERVIEW", count: stageMap["INTERVIEW"] ?? 0, color: "bg-amber-50 text-amber-800 border-amber-200" },
    { label: "Offer", key: "OFFER", count: stageMap["OFFER"] ?? 0, color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { label: "Placed", key: "PLACED", count: stageMap["PLACED"] ?? 0, color: "bg-teal-100 text-teal-900 border-teal-300" },
  ];
  const totalInPipeline = pipelineStages.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      {denied && (
        <p className="form-status form-status--error" role="alert">
          You do not have permission to view that page.
        </p>
      )}

      {/* Top High-level Stats */}
      <div className="portal-grid">
        <article className="portal-card">
          <span className="portal-stat">{teamCount}</span>
          <p>Active team members</p>
        </article>
        <article className="portal-card">
          <span className="portal-stat">{candidateCount}</span>
          <p>Candidates in pool</p>
        </article>
        <article className="portal-card">
          <span className="portal-stat">{projects.length}</span>
          <p>Active client projects</p>
        </article>
        <article className="portal-card">
          <span className="portal-stat">{totalInPipeline}</span>
          <p>Active recruitment pipeline</p>
        </article>
      </div>

      {/* 1. PIPELINE DASHBOARD */}
      <section className="portal-section">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="portal-section-title">Pipeline Dashboard</h2>
            <p className="portal-note">Live candidate status across all active recruitment requisitions ({activeJobsCount} active jobs).</p>
          </div>
          {can(context, "candidate.view") && (
            <Link href="/candidates" className="text-link text-xs font-semibold">
              View Candidate Pool →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {pipelineStages.map((stage) => (
            <div key={stage.key} className={`border rounded-xl p-3 text-center ${stage.color}`}>
              <span className="block text-2xl font-extrabold tracking-tight">{stage.count}</span>
              <span className="text-xs font-semibold uppercase tracking-wider">{stage.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. PROJECT BUDGET DASHBOARD & NEGOTIATION STATUS */}
      <section className="portal-section">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="portal-section-title">Project Budget Dashboard</h2>
            <p className="portal-note">Active project budget utilization and client negotiation statuses.</p>
          </div>
          {can(context, "project.view") && (
            <Link href="/projects" className="text-link text-xs font-semibold">
              All Projects →
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="portal-note">No active projects currently.</p>
        ) : (
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Client</th>
                  <th scope="col">Manager</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Hours Logged</th>
                  <th scope="col">Negotiation Completed</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const totalMinutes = project.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
                  const totalHours = (totalMinutes / 60).toFixed(1);
                  return (
                    <tr key={project.id}>
                      <th scope="row">
                        <strong>{project.name}</strong>
                        <span>{project.code}</span>
                      </th>
                      <td>{project.client.name}</td>
                      <td>{project.manager?.name ?? "Executive Team"}</td>
                      <td>
                        {project.budgetAmount
                          ? formatMoney(project.budgetAmount, project.budgetCurrency)
                          : "Time & Materials"}
                      </td>
                      <td>{totalHours} hrs</td>
                      <td>
                        {project.negotiationCompleted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            No
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusChip status={project.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. RECENT CONTRACT LETTERS */}
      <section className="portal-section">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="portal-section-title">
            {isExecutive ? "Recent Contract Letters" : "Your Contract Letters"}
          </h2>
          {can(context, "contract.view_own") && (
            <Link href="/contracts" className="text-link text-xs font-semibold">
              View all →
            </Link>
          )}
        </div>

        {recentContracts.length === 0 ? (
          <p className="portal-note">Nothing yet. Letters issued will appear here.</p>
        ) : (
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Letter</th>
                  {isExecutive && <th scope="col">Recipient</th>}
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentContracts.map((letter) => (
                  <tr key={letter.id}>
                    <th scope="row">
                      <strong>{letter.reference}</strong>
                    </th>
                    {isExecutive && <td>{letter.subject.name}</td>}
                    <td>
                      <StatusChip status={letter.status} />
                    </td>
                    <td>{shortDate(letter.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action" href={`/contracts/${letter.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
