import Link from "next/link";
import { TimesheetGrid, type GridProject, type GridRow } from "@/components/delivery/timesheet-grid";
import { TimesheetApprovals } from "@/components/delivery/timesheet-approvals";
import { can, requirePermission } from "@/lib/auth/guard";
import { canEditTimesheet, formatDuration, isDayBookable, weekDays, weekStartOf } from "@/lib/delivery/timesheet";
import type { TimesheetStatus } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";

export const metadata = { title: "Timesheets" };

const iso = (date: Date) => date.toISOString().slice(0, 10);

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const context = await requirePermission("timesheet.submit");
  const requested = (await searchParams).week;
  const anchor = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? new Date(`${requested}T00:00:00.000Z`) : new Date();
  const weekStart = weekStartOf(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const dates = weekDays(weekStart).map(iso);

  const [assignments, existing] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: context.user.id },
      include: { project: { include: { client: true, tasks: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
    }),
    db.timesheet.findUnique({ where: { userId_weekStart: { userId: context.user.id, weekStart } }, include: { entries: true } }),
  ]);

  const today = new Date();
  const activeAssignments = assignments.filter((assignment) => ["PLANNED", "ACTIVE"].includes(assignment.project.status));
  // Per project, not per person: "since project started" is Project.startDate
  // when set — someone can backfill down to it even if they joined later,
  // which is exactly the handover case (an incoming resource, or an approver
  // acting for one who has already left, covering days before the new
  // resource's own assignment began). Falls back to the assignment date only
  // for a project with no startDate on record.
  const bookableFrom = (assignment: (typeof activeAssignments)[number]) => assignment.project.startDate ?? assignment.createdAt;

  // A week with no bookable day on any assigned project no longer gets a
  // database row just for being viewed — only create one when there's
  // genuinely something that could be saved against it.
  const anyBookable = activeAssignments.some((assignment) =>
    dates.some((d) => isDayBookable(new Date(`${d}T00:00:00.000Z`), today, bookableFrom(assignment)))
  );
  let sheetId: string, sheetStatus: TimesheetStatus, sheetDecisionNote: string | null, sheetEntries: NonNullable<typeof existing>["entries"];
  if (existing) {
    ({ id: sheetId, status: sheetStatus, decisionNote: sheetDecisionNote, entries: sheetEntries } = existing);
  } else if (anyBookable) {
    const created = await db.timesheet.create({ data: { userId: context.user.id, weekStart }, include: { entries: true } });
    ({ id: sheetId, status: sheetStatus, decisionNote: sheetDecisionNote, entries: sheetEntries } = created);
  } else {
    sheetId = ""; sheetStatus = "DRAFT"; sheetDecisionNote = null; sheetEntries = [];
  }

  const projects: GridProject[] = activeAssignments.map((assignment) => ({
    id: assignment.project.id,
    label: `${assignment.project.client.name} — ${assignment.project.name}`,
    tasks: assignment.project.tasks.map((task) => ({ id: task.id, name: task.name, billable: task.billable })),
    bookableFrom: iso(bookableFrom(assignment)),
  }));

  // Collapse entries into one row per project+task, with a cell per weekday.
  const grouped = new Map<string, GridRow>();
  for (const entry of sheetEntries) {
    const key = `${entry.projectId}:${entry.taskId ?? ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, { key, projectId: entry.projectId, taskId: entry.taskId, durations: Array(7).fill(""), note: entry.note ?? "" });
    }
    const index = dates.indexOf(iso(entry.workDate));
    if (index >= 0) grouped.get(key)!.durations[index] = (entry.minutes / 60).toFixed(2).replace(/\.00$/, "");
  }

  // A week with nothing saved yet would otherwise render zero input cells at
  // all — "Add a row" and the two Autofill buttons were the only way to make
  // one appear. One blank, directly-typeable row per assigned project is
  // there from the start instead, same as "Add a row" would produce.
  const defaultRows: GridRow[] = grouped.size === 0
    ? projects.map((project) => ({
        key: `default-${project.id}`,
        projectId: project.id,
        taskId: project.tasks[0]?.id ?? null,
        durations: Array(7).fill(""),
        note: "",
      }))
    : [...grouped.values()];

  const total = sheetEntries.reduce((sum, entry) => sum + entry.minutes, 0);
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
      // Keyed on the week so navigating to a different one always mounts a
      // fresh component instance. Without this, React reuses the previous
      // instance's `rows` state (initialised once via useState) across a
      // client-side navigation — an unsaved "Autofill" preview from one week
      // would visibly bleed into the next week's grid until a hard refresh
      // forced a remount with correct server-provided data.
      key={dates[0]}
      timesheetId={sheetId}
      weekDates={dates}
      projects={projects}
      initialRows={defaultRows}
      editable={canEditTimesheet(context, { userId: context.user.id, status: sheetStatus }) && anyBookable}
      status={sheetStatus}
      decisionNote={sheetDecisionNote}
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
