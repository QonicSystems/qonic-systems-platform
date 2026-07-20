import { ProjectManager } from "@/components/delivery/project-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { BILLING_LABELS } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const metadata = { title: "Projects" };

const money = (minor: number | null, currency: string) =>
  minor === null ? "—" : `${currency} ${(minor / 100).toLocaleString("en-IN")}`;

export default async function ProjectsPage() {
  const context = await requirePermission("project.view");

  const [projects, clients, people] = await Promise.all([
    db.project.findMany({
      include: { client: true, manager: { select: { name: true } }, _count: { select: { assignments: true } }, timeEntries: { select: { minutes: true, billable: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    db.client.findMany({ where: { status: { in: ["ACTIVE", "PROSPECT"] } }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Delivery</p>
      <h1 className="portal-title">Projects</h1>
      <p className="portal-lead">{projects.length} project{projects.length === 1 ? "" : "s"} across all clients.</p>
    </header>

    <ProjectManager
      projects={projects.map((project) => {
        const minutes = project.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
        return {
          id: project.id, code: project.code, name: project.name, client: project.client.name,
          status: project.status, billing: BILLING_LABELS[project.billing] ?? project.billing,
          budget: money(project.budgetAmount, project.budgetCurrency),
          manager: project.manager?.name ?? "—",
          team: project._count.assignments,
          hours: (minutes / 60).toFixed(1),
        };
      })}
      clients={clients}
      people={people}
      canManage={can(context, "project.manage")}
    />
  </div>;
}
