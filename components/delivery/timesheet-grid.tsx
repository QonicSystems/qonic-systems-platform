"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration, parseDuration } from "@/lib/delivery/timesheet";

export type GridProject = { id: string; label: string; tasks: { id: string; name: string; billable: boolean }[] };
export type GridRow = { key: string; projectId: string; taskId: string | null; durations: string[]; note: string };

export function TimesheetGrid({ timesheetId, weekDates, projects, initialRows, editable, status, decisionNote }: {
  timesheetId: string;
  /** Seven ISO dates, Monday first. */
  weekDates: string[];
  projects: ReadonlyArray<GridProject>;
  initialRows: ReadonlyArray<GridRow>;
  editable: boolean;
  status: string;
  decisionNote: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(initialRows.length > 0 ? [...initialRows] : []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const addRow = () => {
    const project = projects[0];
    if (!project) return;
    setRows((current) => [...current, {
      key: `new-${Date.now()}-${current.length}`,
      projectId: project.id,
      taskId: project.tasks[0]?.id ?? null,
      durations: Array(7).fill(""),
      note: "",
    }]);
  };

  const updateRow = (key: string, patch: Partial<GridRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const setDuration = (key: string, index: number, value: string) => {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const durations = [...row.durations];
      durations[index] = value;
      return { ...row, durations };
    }));
  };

  // Totals recompute from the raw strings so an invalid cell shows as 0 rather
  // than silently dropping out of the total.
  const { dayTotals, weekTotal, invalid } = useMemo(() => {
    const days = Array(7).fill(0);
    let bad = false;
    for (const row of rows) {
      row.durations.forEach((value, index) => {
        const minutes = parseDuration(value);
        if (minutes === null) { bad = true; return; }
        days[index] += minutes;
      });
    }
    return { dayTotals: days, weekTotal: days.reduce((a, b) => a + b, 0), invalid: bad };
  }, [rows]);

  const save = async (submit: boolean) => {
    setBusy(true); setNotice(null);
    const entries = rows.flatMap((row) => row.durations.map((duration, index) => ({
      projectId: row.projectId, taskId: row.taskId, workDate: weekDates[index], duration, note: row.note,
    })).filter((entry) => entry.duration.trim() !== ""));

    try {
      const response = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries, submit }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

  /**
   * Fill 8h on every weekday of the week.
   *
   * `throughToday` stops at today, which is the safe default — booking Friday's
   * eight hours on a Monday is claiming work nobody has done yet. The whole-week
   * variant exists because people commonly fill the sheet in on the last day, or
   * are completing a week that has already passed.
   */
  const autofillWeek = (throughToday: boolean) => {
    if (projects.length === 0) return;
    const project = projects[0];
    const todayIso = new Date().toISOString().slice(0, 10);

    const standardDurations = weekDates.map((iso) => {
      if (isWeekend(iso)) return "";
      if (throughToday && iso > todayIso) return "";
      return "8.0";
    });

    const filledDays = standardDurations.filter((d) => d === "8.0").length;
    if (filledDays === 0) {
      setNotice({
        tone: "error",
        text: throughToday
          ? "No elapsed weekdays in this week up to today. Use “Whole week” to fill it anyway."
          : "This week has no weekdays to fill.",
      });
      return;
    }

    const noteText = `Standard work (${filledDays * 8}h)`;

    if (rows.length === 0) {
      setRows([{
        key: `auto-${Date.now()}`,
        projectId: project.id,
        taskId: project.tasks[0]?.id ?? null,
        durations: standardDurations,
        note: noteText,
      }]);
    } else {
      setRows((current) =>
        current.map((row, idx) =>
          idx === 0 ? { ...row, durations: standardDurations, note: row.note || noteText } : row
        )
      );
    }
    setNotice({
      tone: "success",
      text: `Auto-filled 8h/day across ${filledDays} weekday${filledDays === 1 ? "" : "s"}${throughToday ? " up to today" : ""}.`,
    });
  };

  /** Pull a submitted week back to draft so it can be corrected. */
  const recall = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {status === "REJECTED" && decisionNote && <p className="form-status form-status--error" role="alert">
      Sent back for changes: “{decisionNote}”
    </p>}
    {status === "APPROVED" && <p className="form-status form-status--success" role="status">
      This week has been approved and is locked.
    </p>}
    {status === "SUBMITTED" && <div className="recall-bar">
      <p>
        <strong>Submitted and awaiting approval.</strong> It is locked while an approver looks at it —
        pull it back if you need to change something.
      </p>
      <button type="button" className="button button-outline" onClick={recall} disabled={busy}>
        {busy ? "Working…" : "Recall to draft"}
      </button>
    </div>}

    {projects.length === 0 ? <p className="portal-note">
      You are not assigned to any project yet, so there is nowhere to book time. Ask a project manager to add you.
    </p> : <>
      {editable && (
        <div className="smart-actions">
          <span className="smart-actions__label">Smart actions</span>
          <div className="smart-actions__buttons">
            <button
              type="button"
              className="row-action row-action--highlight"
              onClick={() => autofillWeek(true)}
              disabled={busy}
              title="Fills weekdays up to today with 8h/day — never future dates"
            >
              Autofill to date
            </button>
            <button
              type="button"
              className="row-action row-action--highlight"
              onClick={() => autofillWeek(false)}
              disabled={busy}
              title="Fills Monday to Friday with 8h/day, including days still to come"
            >
              Autofill whole week
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                className="row-action row-action--danger"
                onClick={() => setRows([])}
                disabled={busy}
                title="Empties every cell on screen. Nothing is removed until you save the week."
              >
                Clear all cells
              </button>
            )}
          </div>
        </div>
      )}

      <div className="matrix-scroll">
        <table className="matrix timesheet">
          <thead>
            <tr>
              <th scope="col">Project / Task</th>
              {weekDates.map((iso) => <th key={iso} scope="col" className={isWeekend(iso) ? "is-weekend" : ""}>{dayLabel(iso)}</th>)}
              <th scope="col">Total</th>
              {editable && <th scope="col"><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const project = projects.find((candidate) => candidate.id === row.projectId);
              const rowMinutes = row.durations.reduce((sum, value) => sum + (parseDuration(value) ?? 0), 0);
              return <tr key={row.key}>
                <th scope="row">
                  <select value={row.projectId} disabled={!editable}
                    onChange={(event) => {
                      const next = projects.find((candidate) => candidate.id === event.target.value);
                      updateRow(row.key, { projectId: event.target.value, taskId: next?.tasks[0]?.id ?? null });
                    }}>
                    {projects.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
                  </select>
                  {project && project.tasks.length > 0 && <select className="mt-2" value={row.taskId ?? ""} disabled={!editable}
                    onChange={(event) => updateRow(row.key, { taskId: event.target.value || null })}>
                    {project.tasks.map((task) => <option key={task.id} value={task.id}>{task.name}{task.billable ? "" : " (non-billable)"}</option>)}
                  </select>}
                </th>
                {row.durations.map((value, index) => <td key={index} className={isWeekend(weekDates[index]) ? "is-weekend" : ""}>
                  <input className="duration-input" inputMode="decimal" placeholder="—" value={value} disabled={!editable}
                    aria-label={`${project?.label ?? "Project"} on ${dayLabel(weekDates[index])}`}
                    aria-invalid={parseDuration(value) === null}
                    onChange={(event) => setDuration(row.key, index, event.target.value)} />
                </td>)}
                <td className="timesheet-total">{formatDuration(rowMinutes)}</td>
                {editable && <td>
                  <button type="button" className="row-action row-action--danger"
                    onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}>Remove</button>
                </td>}
              </tr>;
            })}
            {rows.length === 0 && <tr><td colSpan={weekDates.length + (editable ? 3 : 2)}>No time recorded for this week yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Daily total</th>
              {dayTotals.map((minutes, index) => <td key={index} className={isWeekend(weekDates[index]) ? "is-weekend" : ""}>{formatDuration(minutes)}</td>)}
              <td className="timesheet-total">{formatDuration(weekTotal)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && <>
        <p className="field-hint mt-3">Enter time as <code>7.5</code>, <code>7:30</code>, or <code>450m</code>. Leave a cell blank for no time.</p>
        {invalid && <p className="form-error">One of the cells is not a valid duration.</p>}
        <div className="action-bar mt-4">
          <button type="button" className="button button-outline" onClick={addRow} disabled={busy}>Add a row</button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => save(false)}
            disabled={busy || invalid}
            // "Save draft" read as though it kept a copy somewhere. It does not:
            // the write replaces the week outright, so saving an emptied grid
            // deletes that week's entries. The label says what it does.
            title="Saves this week exactly as it appears, without sending it for approval"
          >
            {busy ? "Saving…" : "Save week"}
          </button>
          <button type="button" className="button button-primary" onClick={() => save(true)} disabled={busy || invalid || weekTotal === 0}>
            Submit for approval
          </button>
        </div>
      </>}
    </>}
  </div>;
}
