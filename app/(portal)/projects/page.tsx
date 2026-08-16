import { ProjectManager } from "@/components/delivery/project-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { BILLING_LABELS } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const metadata = { title: "Projects" };

const money = (minor: number | null, currency: string) =>
  minor === null ? "—" : `${currency} ${(minor / 100).toLocaleString("en-IN")}`;

export default async function ProjectsPage() {
  const context = await requirePermission("project.view");

  const [projects, clients, leadershipPeople] = await Promise.all([
    db.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        client: true,
        manager: { select: { name: true } },
        _count: { select: { assignments: true } },
        timeEntries: { select: { minutes: true, billable: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      where: { status: { in: ["ACTIVE", "UPCOMING", "RESCHEDULED", "CANCELLED"] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    // Project Manager restricted strictly to Founder and Co-Founder
    db.user.findMany({
      where: {
        status: "ACTIVE",
        role: { key: { in: [ROLE.CEO, ROLE.CO_FOUNDER] } },
      },
      select: { id: true, name: true, role: { select: { label: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="portal-page">
      <header className="portal-page-head">
        <p className="eyebrow">Delivery</p>
        <h1 className="portal-title">Active Projects</h1>
        <p className="portal-lead">
          {projects.length} active running project{projects.length === 1 ? "" : "s"} across all clients.
        </p>
      </header>

      <ProjectManager
        projects={projects.map((project) => {
          const minutes = project.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
          return {
            id: project.id,
            code: project.code,
            name: project.name,
            client: project.client.name,
            status: project.status,
            billing: BILLING_LABELS[project.billing] ?? project.billing,
            budget: money(project.budgetAmount, project.budgetCurrency),
            manager: project.manager?.name ?? "Leadership",
            team: project._count.assignments,
            hours: (minutes / 60).toFixed(1),
            negotiationCompleted: project.negotiationCompleted,
            completedReason: project.completedReason ?? "",
          };
        })}
        clients={clients}
        people={leadershipPeople.map((p) => ({
          id: p.id,
          name: `${p.name} (${p.role.label})`,
        }))}
        canManage={can(context, "project.manage")}
      />
    </div>
  );
}
