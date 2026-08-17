import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Capacity" };

export default async function CapacityPage() {
  await requirePermission("report.utilization");

  const people = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { notIn: ["ceo", "co_founder"] } },
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
    <header className="portal-page-head">
      <p className="eyebrow">Reports</p>
      <h1 className="portal-title">Capacity</h1>
      <p className="portal-lead">Planned allocation across live projects. This is intent, not recorded time.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{rows.length}</span><p>Active people</p></article>
      <article className="portal-card"><span className="portal-stat">{bench.length}</span><p>On the bench</p></article>
      <article className="portal-card"><span className="portal-stat">{over.length}</span><p>Over-allocated</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Allocation</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Projects</th><th scope="col">Allocated</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <th scope="row"><strong>{row.name}</strong></th>
              <td>{row.role}</td>
              <td>
                {row.projects.length === 0 ? <span className="portal-muted">Unassigned</span>
                  : row.projects.map((project) => <span key={project.name} className="alloc-chip">
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
