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
    // Every status is loaded and the table filters client-side. Fetching only
    // ACTIVE would make a cancelled project vanish the moment it was cancelled,
    // with no way back to it.
    db.project.findMany({
      include: {
        client: true,
        manager: { select: { name: true } },
        _count: { select: { assignments: true, timeEntries: true, invoices: true, expenses: true } },
        timeEntries: { select: { minutes: true, billable: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
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

  const activeCount = projects.filter((project) => project.status === "ACTIVE").length;

  return (
    <div className="portal-page">
      <header className="portal-page-head">
        <p className="eyebrow">Delivery</p>
        <h1 className="portal-title">Projects</h1>
        <p className="portal-lead">
          {activeCount} running project{activeCount === 1 ? "" : "s"} across all clients
          {projects.length > activeCount ? ` · ${projects.length - activeCount} completed or cancelled` : ""}.
        </p>
      </header>

      <ProjectManager
        projects={projects.map((project) => {
          const minutes = project.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
          return {
            id: project.id,
            code: project.code,
            name: project.name,
            clientId: project.clientId,
            client: project.client.name,
            status: project.status,
            billing: BILLING_LABELS[project.billing] ?? project.billing,
            rawBilling: project.billing,
            budget: money(project.budgetAmount, project.budgetCurrency),
            budgetAmount: project.budgetAmount !== null ? String(project.budgetAmount / 100) : "",
            budgetCurrency: project.budgetCurrency,
            defaultRate: project.defaultRate !== null ? String(project.defaultRate / 100) : "",
            startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : "",
            endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : "",
            managerId: project.managerId ?? "",
            manager: project.manager?.name ?? "Leadership",
            notes: project.notes ?? "",
            team: project._count.assignments,
            hours: (minutes / 60).toFixed(1),
            negotiationCompleted: project.negotiationCompleted,
            completedReason: project.completedReason ?? "",
            timeEntryCount: project._count.timeEntries,
            invoiceCount: project._count.invoices,
            expenseCount: project._count.expenses,
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
