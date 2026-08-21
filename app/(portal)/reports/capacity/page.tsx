import { BarChart } from "@/components/portal/bar-chart";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { statusSlug } from "@/lib/ui/status";

export const metadata = { title: "Capacity" };

export default async function CapacityPage() {
  await requirePermission("report.utilization");

  // Leadership's own name against a delivery allocation bar reads as
  // "the CEO is 100% booked," which isn't a capacity-planning fact anyone
  // acts on — this report is for staffing the bench, not tracking founders.
  const people = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { notIn: [ROLE.CEO, ROLE.CO_FOUNDER] } },
      OR: [
        { projectAssignments: { some: {} } },
        { timesheets: { some: { entries: { some: {} } } } },
      ],
    },
    include: {
      role: { select: { label: true } },
      projectAssignments: { include: { project: { include: { client: { select: { name: true } } } } } },
    },
    orderBy: { name: "asc" },
  });

  // Only live projects consume capacity — a completed one should not make
  // someone look busy.
  const rows = people.map((person) => {
    const live = person.projectAssignments.filter((a) => ["PLANNED", "ACTIVE"].includes(a.project.status));
    const allocated = live.reduce((sum, a) => sum + a.allocationPercent, 0);
    return {
      id: person.id, name: person.name, role: person.role.label, allocated,
      projects: live.map((a) => ({ name: `${a.project.client.name} — ${a.project.name}`, percent: a.allocationPercent, health: a.project.health })),
    };
  });

  const bench = rows.filter((row) => row.allocated === 0);
  const over = rows.filter((row) => row.allocated > 100);

  return <div className="portal-page">
    <div className="hero-panel">
      <span className="hero-eyebrow">Reports</span>
      <h1 className="hero-title">Capacity</h1>
      <p className="hero-lead">Planned allocation across live projects. This is intent, not recorded time.</p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value">{rows.length}</span>
          <p className="hero-stat-label">Active people</p>
        </div>
        <div>
          <span className="hero-stat-value">{bench.length}</span>
          <p className="hero-stat-label">On the bench</p>
        </div>
        <div>
          <span className="hero-stat-value">{over.length}</span>
          <p className="hero-stat-label">Over-allocated</p>
        </div>
      </div>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Allocation</h2>
      {rows.length > 0 && <div className="chart-panel">
        <BarChart
          ariaLabel="Allocation by person"
          max={100}
          items={[...rows].sort((a, b) => b.allocated - a.allocated).map((row) => ({
            key: row.id,
            label: row.name,
            value: row.allocated,
            formattedValue: `${row.allocated}%`,
            severity: row.allocated > 100 ? 4 : undefined,
          }))}
        />
      </div>}
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Projects</th><th scope="col">Allocated</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <th scope="row"><strong>{row.name}</strong></th>
              <td>{row.role}</td>
              <td>
                {row.projects.length === 0 ? <span className="portal-muted">Unassigned</span>
                  : row.projects.map((project) => <span key={project.name} className={`alloc-chip alloc-chip--${statusSlug(project.health)}`}>
                      {project.name} · {project.percent}%
                    </span>)}
              </td>
              <td>
                <div className="meter" role="img" aria-label={`${row.allocated}% allocated`}>
                  <span className={row.allocated > 100 ? "is-over" : ""} style={{ width: `${Math.min(100, row.allocated)}%` }} />
                </div>
                <strong className={row.allocated > 100 ? "text-over" : ""}>{row.allocated}%</strong>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
