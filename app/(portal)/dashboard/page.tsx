import Link from "next/link";
import { BarChart, SplitBarChart } from "@/components/portal/bar-chart";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { weekStartOf } from "@/lib/delivery/timesheet";
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
  const userId = context.user.id;

  // Every widget below is gated on the permission it actually requires — not
  // a hardcoded role key — so this page shows exactly what the account holds
  // right now, live, the same way every other page in the app resolves
  // access. A role with just `project.view` (say) gets that tile and nothing
  // else; nobody sees client budgets or the candidate pipeline without the
  // permission that names them.
  const canViewProjects = can(context, "project.view");
  const canViewCandidates = can(context, "candidate.view");
  const canViewAllContracts = can(context, "contract.view_all");
  const canViewOwnContracts = can(context, "contract.view_own");
  const canViewContracts = canViewAllContracts || canViewOwnContracts;
  const canSubmitTimesheet = can(context, "timesheet.submit");
  const canRequestLeave = can(context, "leave.request");
  const canViewOwnPayout = can(context, "payout.view_own");
  const canViewDirectory = can(context, "directory.view");

  const thisWeekStart = weekStartOf(new Date());

  const [
    teamCount,
    candidateCount,
    pipelineGroup,
    projects,
    contracts,
    myAssignments,
    myTimesheet,
    pendingLeaveCount,
  ] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    canViewCandidates ? db.candidate.count({ where: { status: "ACTIVE" } }) : Promise.resolve(0),
    canViewCandidates
      ? db.application.groupBy({ by: ["stage"], _count: { _all: true } })
      : Promise.resolve([]),
    canViewProjects
      ? db.project.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, budgetAmount: true, budgetCurrency: true, negotiationCompleted: true },
        })
      : Promise.resolve([]),
    canViewContracts
      ? db.contractLetter.findMany({
          where: canViewAllContracts ? {} : { subjectUserId: userId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          include: { subject: { select: { name: true } } },
        })
      : Promise.resolve([]),
    db.projectAssignment.findMany({
      where: { userId, project: { status: "ACTIVE" } },
      select: { id: true },
    }),
    canSubmitTimesheet
      ? db.timesheet.findFirst({ where: { userId, weekStart: thisWeekStart }, select: { status: true } })
      : Promise.resolve(null),
    canRequestLeave ? db.leaveRequest.count({ where: { userId, status: "PENDING" } }) : Promise.resolve(0),
  ]);

  const stageMap = Object.fromEntries(pipelineGroup.map((g) => [g.stage, g._count._all]));
  const pipelineStages = [
    { key: "SOURCED", label: "Sourced" },
    { key: "SCREENED", label: "Screened" },
    { key: "SUBMITTED", label: "Submitted" },
    { key: "INTERVIEW", label: "Interview" },
    { key: "OFFER", label: "Offer" },
    { key: "PLACED", label: "Placed" },
  ].map((stage) => ({ ...stage, count: stageMap[stage.key] ?? 0 }));
  const totalInPipeline = pipelineStages.reduce((sum, s) => sum + s.count, 0);

  const negotiationCompletedCount = projects.filter((p) => p.negotiationCompleted).length;
  // Summed only when every budgeted project shares one currency — adding minor
  // units across currencies would silently produce a meaningless figure.
  const budgetCurrencies = new Set(projects.filter((p) => p.budgetAmount !== null).map((p) => p.budgetCurrency));
  const totalActiveBudget = budgetCurrencies.size <= 1
    ? projects.reduce((sum, p) => sum + (p.budgetAmount ?? 0), 0)
    : null;
  const singleBudgetCurrency = budgetCurrencies.size === 1 ? [...budgetCurrencies][0] : "INR";

  const timesheetLabel = !canSubmitTimesheet
    ? null
    : myTimesheet
      ? myTimesheet.status
      : "NOT STARTED";

  return (
    <>
      {denied && (
        <p className="form-status form-status--error" role="alert">
          You do not have permission to view that page.
        </p>
      )}

      <div className="hero-panel">
        <span className="hero-eyebrow">{context.role.label}</span>
        <h1 className="hero-title">Welcome back, {context.user.name}</h1>
        <p className="hero-lead">
          {canViewProjects || canViewCandidates
            ? "A glance across delivery and recruitment, and what's on your own plate."
            : "What's on your plate this week, and the tools you have to hand."}
        </p>
        <div className="hero-stats">
          <div>
            <span className="hero-stat-value">{teamCount}</span>
            <p className="hero-stat-label">Active team members</p>
          </div>
          {canViewCandidates && (
            <div>
              <span className="hero-stat-value">{candidateCount}</span>
              <p className="hero-stat-label">Candidates in pool</p>
            </div>
          )}
          {canViewProjects && (
            <div>
              <span className="hero-stat-value">{projects.length}</span>
              <p className="hero-stat-label">Active client projects</p>
            </div>
          )}
          <div>
            <span className="hero-stat-value">{myAssignments.length}</span>
            <p className="hero-stat-label">My active projects</p>
          </div>
          {timesheetLabel && (
            <div>
              <span className="hero-stat-value" style={{ fontSize: "1.4rem" }}>{timesheetLabel}</span>
              <p className="hero-stat-label">My timesheet, this week</p>
            </div>
          )}
          {canRequestLeave && (
            <div>
              <span className="hero-stat-value">{pendingLeaveCount}</span>
              <p className="hero-stat-label">My leave, pending</p>
            </div>
          )}
        </div>
      </div>

      <div className="capability-grid">
        {canViewCandidates && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">P</span>
              <h3>Recruitment Pipeline</h3>
              <span className="capability-tile-count">{totalInPipeline}</span>
            </div>
            <BarChart
              ariaLabel="Candidates by pipeline stage"
              items={pipelineStages.map((stage) => ({
                key: stage.key, label: stage.label, value: stage.count, formattedValue: String(stage.count),
              }))}
            />
            <Link href="/candidates" className="capability-tile-link">View candidate pool →</Link>
          </article>
        )}

        {canViewProjects && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">B</span>
              <h3>Project Budgets</h3>
              <span className="capability-tile-count">{projects.length}</span>
            </div>
            <p style={{ margin: "0 0 1rem", color: "#fff", fontSize: "1.3rem", fontWeight: 800 }}>
              {totalActiveBudget !== null ? formatMoney(totalActiveBudget, singleBudgetCurrency) : "Mixed currencies"}
              <span style={{ marginLeft: "0.5rem", color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", fontWeight: 600 }}>
                total active budget
              </span>
            </p>
            {projects.length > 0 && (
              <SplitBarChart
                primaryLabel="Negotiation completed"
                contextLabel="Still negotiating"
                rows={[{
                  key: "negotiation", label: "Active projects",
                  primary: negotiationCompletedCount, context: projects.length - negotiationCompletedCount,
                  primaryFormatted: String(negotiationCompletedCount), contextFormatted: String(projects.length - negotiationCompletedCount),
                }]}
              />
            )}
            <Link href="/projects" className="capability-tile-link">View all projects →</Link>
          </article>
        )}

        {canViewContracts && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">C</span>
              <h3>{canViewAllContracts ? "Recent Contract Letters" : "Your Contract Letters"}</h3>
              <span className="capability-tile-count">{contracts.length}</span>
            </div>
            {contracts.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>Nothing yet. Letters issued will appear here.</p>
            ) : (
              <ul>
                {contracts.map((letter) => (
                  <li key={letter.id}>
                    <strong>{letter.reference}</strong>
                    <span>
                      {canViewAllContracts ? `${letter.subject.name} · ` : ""}
                      <StatusChip status={letter.status} /> · {shortDate(letter.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/contracts" className="capability-tile-link">View all →</Link>
          </article>
        )}

        {canSubmitTimesheet && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">T</span>
              <h3>Timesheets</h3>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>
              {myTimesheet ? `This week is ${myTimesheet.status.toLowerCase()}.` : "You haven't started this week's timesheet yet."}
            </p>
            <Link href="/timesheets" className="capability-tile-link">Open timesheets →</Link>
          </article>
        )}

        {canRequestLeave && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">L</span>
              <h3>Leave</h3>
              {pendingLeaveCount > 0 && <span className="capability-tile-count">{pendingLeaveCount}</span>}
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>
              {pendingLeaveCount > 0
                ? `${pendingLeaveCount} request${pendingLeaveCount === 1 ? "" : "s"} awaiting a decision.`
                : "No pending requests."}
            </p>
            <Link href="/leave" className="capability-tile-link">Open leave →</Link>
          </article>
        )}

        {canViewOwnPayout && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">E</span>
              <h3>My Earnings</h3>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>
              Your day-by-day payout breakdown, split between actual payout and company-billed backfill.
            </p>
            <Link href="/earnings" className="capability-tile-link">Open earnings →</Link>
          </article>
        )}

        {canViewDirectory && (
          <article className="capability-tile">
            <div className="capability-tile-head">
              <span className="capability-tile-icon" aria-hidden="true">D</span>
              <h3>Team Directory</h3>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>
              Colleagues&apos; names, roles, and work contact details.
            </p>
            <Link href="/directory" className="capability-tile-link">Open directory →</Link>
          </article>
        )}
      </div>
    </>
  );
}
