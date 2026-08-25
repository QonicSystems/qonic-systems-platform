import { ProjectManager } from "@/components/delivery/project-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { isLeadershipRank, leadershipRoleWhere } from "@/lib/auth/roles";
import { ACCEPTED_CONTRACT_STATUS } from "@/lib/contracts/eligibility";
import { BILLING_LABELS } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const metadata = { title: "Projects" };

const money = (minor: number | null, currency: string) =>
  minor === null ? "—" : `${currency} ${(minor / 100).toLocaleString("en-IN")}`;

export default async function ProjectsPage() {
  const context = await requirePermission("project.view");

  const [projects, clients, leadershipPeople, allEmployees] = await Promise.all([
    // Every status is loaded and the table filters client-side. Fetching only
    // ACTIVE would make a cancelled project vanish the moment it was cancelled,
    // with no way back to it.
    db.project.findMany({
      include: {
        client: true,
        manager: { select: { name: true } },
        assignments: {
          select: {
            userId: true,
            allocationPercent: true,
            startedOn: true,
            user: { select: { id: true, name: true, email: true, jobTitle: true, status: true, role: { select: { key: true, label: true, rank: true } } } },
          },
        },
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
    // Project Manager is restricted to leadership. Matched on rank rather than
    // a list of role keys, so a role the CEO creates at rank 10 or better is
    // eligible without a code change.
    db.user.findMany({
      where: {
        status: "ACTIVE",
        role: leadershipRoleWhere,
      },
      select: { id: true, name: true, role: { select: { label: true } } },
      orderBy: { name: "asc" },
    }),
    // Only Developers who have personally accepted a released contract letter
    // may be allocated. The relation filter protects the UI, while the API
    // repeats the same rule to protect against a forged request.
    db.user.findMany({
      where: {
        status: "ACTIVE",
        role: { viaCandidatePool: true },
        contractsSubject: { some: { status: ACCEPTED_CONTRACT_STATUS } },
      },
      select: { id: true, name: true, email: true, jobTitle: true, role: { select: { key: true, label: true } } },
      orderBy: [{ name: "asc" }],
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
          // Deactivated/archived people keep their historical assignment row
          // (it's what their already-booked time, invoices, and payout
          // ledger entries key off) but no longer show as "currently
          // assigned" — that reads as an active team member when they're not.
          const validAssignments = project.assignments.filter(
            (a) => !isLeadershipRank(a.user.role.rank) && a.user.status === "ACTIVE"
          );
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
            team: validAssignments.length,
            assignments: validAssignments.map((a) => ({
            userId: a.userId,
            allocationPercent: a.allocationPercent,
            startedOn: a.startedOn ? a.startedOn.toISOString().slice(0, 10) : "",
              name: a.user.name,
              email: a.user.email,
              roleLabel: a.user.role.label,
              jobTitle: a.user.jobTitle ?? "",
            })),
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
        allEmployees={allEmployees.map((e) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          roleLabel: e.role.label,
          jobTitle: e.jobTitle ?? "",
        }))}
        canManage={can(context, "project.manage")}
      />
    </div>
  );
}
