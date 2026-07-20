import Link from "next/link";
import { TimesheetGrid, type GridProject, type GridRow } from "@/components/delivery/timesheet-grid";
import { TimesheetApprovals } from "@/components/delivery/timesheet-approvals";
import { can, requirePermission } from "@/lib/auth/guard";
import { canEditTimesheet, formatDuration, weekDays, weekStartOf } from "@/lib/delivery/timesheet";
import { db } from "@/lib/db";

export const metadata = { title: "Timesheets" };

const iso = (date: Date) => date.toISOString().slice(0, 10);

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const context = await requirePermission("timesheet.submit");
  const requested = (await searchParams).week;
  const anchor = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? new Date(`${requested}T00:00:00.000Z`) : new Date();
  const weekStart = weekStartOf(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const dates = weekDays(weekStart).map(iso);

  // The week is created on first visit so the grid always has something to bind to.
  const sheet = await db.timesheet.upsert({
    where: { userId_weekStart: { userId: context.user.id, weekStart } },
    update: {},
    create: { userId: context.user.id, weekStart },
    include: { entries: true },
  });

  const assignments = await db.projectAssignment.findMany({
    where: { userId: context.user.id },
    include: { project: { include: { client: true, tasks: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
  });

  const projects: GridProject[] = assignments
    .filter((assignment) => ["PLANNED", "ACTIVE"].includes(assignment.project.status))
    .map((assignment) => ({
      id: assignment.project.id,
      label: `${assignment.project.client.name} — ${assignment.project.name}`,
      tasks: assignment.project.tasks.map((task) => ({ id: task.id, name: task.name, billable: task.billable })),
    }));

  // Collapse entries into one row per project+task, with a cell per weekday.
  const grouped = new Map<string, GridRow>();
  for (const entry of sheet.entries) {
    const key = `${entry.projectId}:${entry.taskId ?? ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, { key, projectId: entry.projectId, taskId: entry.taskId, durations: Array(7).fill(""), note: entry.note ?? "" });
    }
    const index = dates.indexOf(iso(entry.workDate));
    if (index >= 0) grouped.get(key)!.durations[index] = (entry.minutes / 60).toFixed(2).replace(/\.00$/, "");
  }

  const total = sheet.entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const previous = new Date(weekStart.getTime()); previous.setUTCDate(previous.getUTCDate() - 7);
  const next = new Date(weekStart.getTime()); next.setUTCDate(next.getUTCDate() + 7);

  const pending = can(context, "timesheet.approve")
    ? await db.timesheet.findMany({
        where: { status: "SUBMITTED", NOT: { userId: context.user.id } },
        include: { user: { select: { name: true } }, entries: true },
        orderBy: { weekStart: "desc" },
      })
    : [];

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Delivery</p>
      <h1 className="portal-title">Timesheets</h1>
      <p className="portal-lead">
        Week of {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {formatDuration(total)} recorded
      </p>
    </header>

    <div className="action-bar">
      <Link className="button button-outline" href={`/timesheets?week=${iso(previous)}`}>← Previous week</Link>
      <Link className="button button-outline" href="/timesheets">This week</Link>
      <Link className="button button-outline" href={`/timesheets?week=${iso(next)}`}>Next week →</Link>
    </div>

    <TimesheetGrid
      timesheetId={sheet.id}
      weekDates={dates}
      projects={projects}
      initialRows={[...grouped.values()]}
      editable={canEditTimesheet(context, sheet)}
      status={sheet.status}
      decisionNote={sheet.decisionNote}
    />

    {pending.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Awaiting your approval</h2>
      <TimesheetApprovals sheets={pending.map((entry) => ({
        id: entry.id,
        name: entry.user.name,
        week: entry.weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        total: formatDuration(entry.entries.reduce((sum, row) => sum + row.minutes, 0)),
        billable: formatDuration(entry.entries.filter((row) => row.billable).reduce((sum, row) => sum + row.minutes, 0)),
      }))} />
    </section>}
  </div>;
}
