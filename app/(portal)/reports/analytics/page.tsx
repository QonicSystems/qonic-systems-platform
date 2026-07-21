import { requirePermission } from "@/lib/auth/guard";
import { STAGE_LABELS } from "@/lib/ats/pipeline";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/delivery/timesheet";
import { db } from "@/lib/db";

export const metadata = { title: "Analytics" };

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default async function AnalyticsPage() {
  await requirePermission("report.utilization");

  const [applications, placements, invoices, entries, people] = await Promise.all([
    db.application.findMany({ include: { events: { orderBy: { createdAt: "asc" } } } }),
    db.placement.findMany({ include: { application: { include: { job: true } } } }),
    db.invoice.findMany({ where: { status: { notIn: ["DRAFT", "VOID"] } } }),
    db.timeEntry.findMany({ where: { timesheet: { status: "APPROVED" } }, select: { minutes: true, billable: true } }),
    db.user.findMany({ select: { id: true, status: true, joinedOn: true, leftOn: true } }),
  ]);

  // --- Time to fill: from the application being created to the placement.
  const fillDays = placements
    .map((placement) => {
      const created = applications.find((a) => a.id === placement.applicationId)?.createdAt;
      return created ? Math.max(0, Math.round((placement.createdAt.getTime() - created.getTime()) / 86_400_000)) : null;
    })
    .filter((value): value is number => value !== null);
  const medianFill = fillDays.length === 0 ? null : [...fillDays].sort((a, b) => a - b)[Math.floor(fillDays.length / 2)];

  // --- Funnel: how far each application ever got, not just where it sits now.
  const FUNNEL = ["SOURCED", "SCREENED", "SUBMITTED", "INTERVIEW", "OFFER", "PLACED"] as const;
  const reached = new Map<string, number>(FUNNEL.map((stage) => [stage, 0]));
  for (const application of applications) {
    const stages = new Set(application.events.map((event) => event.toStage));
    stages.add(application.stage);
    for (const stage of FUNNEL) if (stages.has(stage)) reached.set(stage, (reached.get(stage) ?? 0) + 1);
  }

  // --- Margin: billed revenue against the cost of the time behind it.
  const billed = invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0);
  const billableMinutes = entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.minutes, 0);
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const feeRevenue = placements.filter((p) => !p.fellOutAt).reduce((sum, p) => sum + p.feeAmount, 0);

  // --- Attrition over the last rolling year.
  const yearAgo = new Date(new Date().getTime() - 365 * 86_400_000);
  const leavers = people.filter((person) => person.leftOn && person.leftOn >= yearAgo).length;
  const headcount = people.filter((person) => person.status === "ACTIVE").length;
  const attrition = headcount === 0 ? 0 : leavers / headcount;

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Reports</p>
      <h1 className="portal-title">Analytics</h1>
      <p className="portal-lead">Recruitment, delivery, and people metrics in one place.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{medianFill === null ? "—" : `${medianFill}d`}</span><p>Median time to fill</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(billed + feeRevenue)}</span><p>Revenue booked</p></article>
      <article className="portal-card"><span className="portal-stat">{totalMinutes === 0 ? "—" : percent(billableMinutes / totalMinutes)}</span><p>Billable share of time</p></article>
      <article className="portal-card"><span className="portal-stat">{percent(attrition)}</span><p>Attrition, rolling year</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Recruitment funnel</h2>
      <p className="portal-note">How many applications ever reached each stage, and the conversion from the one before.</p>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Stage</th><th scope="col">Reached</th><th scope="col">From previous</th><th scope="col"></th></tr></thead>
          <tbody>
            {FUNNEL.map((stage, index) => {
              const count = reached.get(stage) ?? 0;
              const previous = index === 0 ? count : reached.get(FUNNEL[index - 1]) ?? 0;
              const rate = previous === 0 ? 0 : count / previous;
              const top = reached.get(FUNNEL[0]) ?? 0;
              return <tr key={stage}>
                <th scope="row"><strong>{STAGE_LABELS[stage]}</strong></th>
                <td>{count}</td>
                <td>{index === 0 ? "—" : percent(rate)}</td>
                <td>
                  <div className="meter" role="img" aria-label={`${count} reached`}>
                    <span style={{ width: `${top === 0 ? 0 : Math.round((count / top) * 100)}%` }} />
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Revenue mix</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <tbody>
            <tr><th scope="row">Professional services (invoiced, ex tax)</th><td>{formatMoney(billed)}</td></tr>
            <tr><th scope="row">Placement fees</th><td>{formatMoney(feeRevenue)}</td></tr>
            <tr><th scope="row">Approved time recorded</th><td>{formatDuration(totalMinutes)}</td></tr>
            <tr><th scope="row">Of which billable</th><td>{formatDuration(billableMinutes)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="portal-note">
        Attrition needs joining and leaving dates on staff records to be meaningful; it reads 0% until those are filled in.
      </p>
    </section>
  </div>;
}
