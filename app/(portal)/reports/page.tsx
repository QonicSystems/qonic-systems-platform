import { BarChart, SplitBarChart } from "@/components/portal/bar-chart";
import { requirePermission } from "@/lib/auth/guard";
import { STANDARD_WEEK_MINUTES, formatDuration, utilisation, weekStartOf } from "@/lib/delivery/timesheet";
import { db } from "@/lib/db";

export const metadata = { title: "Utilisation" };

const WEEKS = 4;

export default async function ReportsPage() {
  await requirePermission("report.utilization");

  // A rolling four-week window, ending with the current week.
  const thisWeek = weekStartOf(new Date());
  const from = new Date(thisWeek.getTime());
  from.setUTCDate(from.getUTCDate() - 7 * (WEEKS - 1));

  const [people, entries, projects] = await Promise.all([
    // Anyone doing delivery work, by evidence rather than by job title.
    //
    // This used to exclude the CEO and Co-Founder outright, on the assumption
    // that leadership does not bill. In a firm where the founders deliver, that
    // hid the only recorded time in the system and the report read as empty and
    // broken. Someone with neither an assignment nor booked time is still left
    // out, so pure-admin accounts do not pad the list with permanent zeroes.
    db.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { projectAssignments: { some: {} } },
          { timesheets: { some: { entries: { some: {} } } } },
        ],
      },
      select: { id: true, name: true, role: { select: { label: true } } },
      orderBy: { name: "asc" },
    }),
    db.timeEntry.findMany({
      where: { workDate: { gte: from } },
      select: { minutes: true, billable: true, projectId: true, timesheet: { select: { userId: true, status: true } } },
    }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "PLANNED"] } }, select: { id: true, name: true, client: { select: { name: true } } } }),
  ]);

  // Only approved and submitted time counts — a draft is not a claim yet.
  const counted = entries.filter((entry) => ["SUBMITTED", "APPROVED"].includes(entry.timesheet.status));

  const byPerson = new Map<string, { billable: number; nonBillable: number }>();
  for (const entry of counted) {
    const bucket = byPerson.get(entry.timesheet.userId) ?? { billable: 0, nonBillable: 0 };
    if (entry.billable) bucket.billable += entry.minutes; else bucket.nonBillable += entry.minutes;
    byPerson.set(entry.timesheet.userId, bucket);
  }

  const byProject = new Map<string, number>();
  for (const entry of counted) byProject.set(entry.projectId, (byProject.get(entry.projectId) ?? 0) + entry.minutes);

  const capacity = STANDARD_WEEK_MINUTES * WEEKS;
  const rows = people.map((person) => {
    const bucket = byPerson.get(person.id) ?? { billable: 0, nonBillable: 0 };
    const stats = utilisation({ billableMinutes: bucket.billable, nonBillableMinutes: bucket.nonBillable, capacityMinutes: capacity });
    return { ...person, ...stats };
  });

  const totals = utilisation({
    billableMinutes: rows.reduce((sum, row) => sum + row.billableMinutes, 0),
    nonBillableMinutes: rows.reduce((sum, row) => sum + row.nonBillableMinutes, 0),
    capacityMinutes: capacity * Math.max(1, people.length),
  });

  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Delivery</p>
      <h1 className="portal-title">Utilisation</h1>
      <p className="portal-lead">
        Last {WEEKS} weeks from {from.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}.
        Draft timesheets are excluded.
      </p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{percent(totals.utilisation)}</span><p>Team utilisation</p></article>
      <article className="portal-card"><span className="portal-stat">{percent(totals.billableRatio)}</span><p>Billable share of booked time</p></article>
      <article className="portal-card"><span className="portal-stat">{formatDuration(totals.totalMinutes)}</span><p>Total time recorded</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">By person</h2>
      <p className="portal-note">Utilisation is billable time against a {STANDARD_WEEK_MINUTES / 60}-hour week. Someone on the bench shows 0%.</p>
      {rows.length > 0 && <div className="chart-panel">
        <SplitBarChart
          primaryLabel="Billable"
          contextLabel="Non-billable"
          rows={[...rows].sort((a, b) => b.billableMinutes + b.nonBillableMinutes - (a.billableMinutes + a.nonBillableMinutes)).map((row) => ({
            key: row.id,
            label: row.name,
            primary: row.billableMinutes,
            context: row.nonBillableMinutes,
            primaryFormatted: formatDuration(row.billableMinutes),
            contextFormatted: formatDuration(row.nonBillableMinutes),
          }))}
        />
      </div>}
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Billable</th><th scope="col">Non-billable</th><th scope="col">Billable share</th><th scope="col">Utilisation</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <th scope="row"><strong>{row.name}</strong></th>
              <td>{row.role.label}</td>
              <td>{formatDuration(row.billableMinutes)}</td>
              <td>{formatDuration(row.nonBillableMinutes)}</td>
              <td>{percent(row.billableRatio)}</td>
              <td>
                <div className="meter" role="img" aria-label={`${percent(row.utilisation)} utilised`}>
                  <span style={{ width: `${Math.min(100, Math.round(row.utilisation * 100))}%` }} />
                </div>
                {percent(row.utilisation)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">By project</h2>
      {byProject.size === 0 ? <p className="portal-note">No time recorded in this window yet.</p> : <>
        <div className="chart-panel">
          <BarChart
            ariaLabel="Time recorded by project"
            items={[...projects]
              .filter((project) => byProject.has(project.id))
              .sort((a, b) => (byProject.get(b.id) ?? 0) - (byProject.get(a.id) ?? 0))
              .map((project) => ({
                key: project.id,
                label: `${project.client.name} — ${project.name}`,
                value: byProject.get(project.id) ?? 0,
                formattedValue: formatDuration(byProject.get(project.id) ?? 0),
              }))}
          />
        </div>
        <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead><tr><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Time</th></tr></thead>
            <tbody>
              {projects
                .filter((project) => byProject.has(project.id))
                .sort((a, b) => (byProject.get(b.id) ?? 0) - (byProject.get(a.id) ?? 0))
                .map((project) => <tr key={project.id}>
                  <th scope="row"><strong>{project.name}</strong></th>
                  <td>{project.client.name}</td>
                  <td>{formatDuration(byProject.get(project.id) ?? 0)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  </div>;
}
