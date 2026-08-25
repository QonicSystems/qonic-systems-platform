"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { RingStat } from "@/components/portal/ring-stat";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { StatusChip } from "@/components/status-chip";
import { useFilter } from "@/lib/ui/filter";

export type LeaveTypeOption = { id: string; label: string; colour: string; entitled: number; used: number; tracksBalance: boolean };
export type LeaveRow = {
  id: string; typeLabel: string; colour: string; from: string; to: string; days: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requesterName?: string; reason: string | null; decisionNote: string | null;
  canDecide: boolean; canCancel: boolean;
};

type Errors = Partial<Record<"leaveTypeId" | "startDate" | "endDate" | "reason", string>>;

export function LeaveManager({ types, mine, toDecide, canRequest }: {
  types: ReadonlyArray<LeaveTypeOption>;
  mine: ReadonlyArray<LeaveRow>;
  toDecide: ReadonlyArray<LeaveRow>;
  canRequest: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ leaveTypeId: types[0]?.id ?? "", startDate: "", endDate: "", reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const response = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { message?: string; errors?: Errors };
      if (!response.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to submit." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Requested." });
      setForm({ leaveTypeId: types[0]?.id ?? "", startDate: "", endDate: "", reason: "" });
      router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  const decide = async (id: string, decision: "APPROVED" | "REJECTED" | "CANCELLED") => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/leave/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div className="portal-page">
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="hero-panel">
      <span className="hero-eyebrow">Time off</span>
      <h1 className="hero-title">Your balances</h1>
      <p className="hero-lead">What you have left this year. Weekends and public holidays are excluded automatically.</p>
      <div className="ring-stat-row" style={{ marginTop: "2rem" }}>
        {types.map((type) => <RingStat
          key={type.id}
          label={type.label}
          colour={type.colour}
          fraction={type.tracksBalance ? (type.entitled === 0 ? 0 : Math.max(0, type.entitled - type.used) / type.entitled) : null}
          value={type.tracksBalance ? String(Math.max(0, type.entitled - type.used)) : "∞"}
          valueLabel={type.tracksBalance ? `of ${type.entitled} days` : "No annual limit"}
        />)}
      </div>
    </div>

    {canRequest && <section className="portal-section">
      <h2 className="portal-section-title">Request leave</h2>
      <div className="portal-panel">
        <form className="contact-form" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="leaveTypeId">Leave Type <em>*</em></label>
              <select id="leaveTypeId" value={form.leaveTypeId} onChange={(event) => update("leaveTypeId", event.target.value)} aria-invalid={Boolean(errors.leaveTypeId)}>
                {types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              {errors.leaveTypeId && <p className="form-error">{errors.leaveTypeId}</p>}
            </div>
            <div>
              <label htmlFor="startDate">From <em>*</em></label>
              <input id="startDate" type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} aria-invalid={Boolean(errors.startDate)} />
              {errors.startDate && <p className="form-error">{errors.startDate}</p>}
            </div>
            <div>
              <label htmlFor="endDate">To <em>*</em></label>
              <input id="endDate" type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} aria-invalid={Boolean(errors.endDate)} />
              {errors.endDate && <p className="form-error">{errors.endDate}</p>}
            </div>
          </div>
          <div className="mt-5">
            <label htmlFor="reason">Reason</label>
            <input id="reason" value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Optional — helps your approver decide" />
          </div>
          <p className="field-hint mt-3">Weekends and public holidays are excluded automatically.</p>
          <button className="button button-primary mt-5" type="submit" disabled={busy || types.length === 0}>
            {busy ? "Submitting…" : "Submit Request"}
          </button>
        </form>
      </div>
    </section>}

    {toDecide.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Awaiting your decision</h2>
      <LeaveTable rows={toDecide} showRequester busy={busy} onDecide={decide} />
    </section>}

    <section className="portal-section">
      <h2 className="portal-section-title">Your requests</h2>
      {mine.length === 0 ? <p className="portal-note">You have not requested any leave yet.</p>
        : <LeaveTable rows={mine} busy={busy} onDecide={decide} />}
    </section>
  </div>;
}

function LeaveTable({ rows, showRequester, busy, onDecide }: {
  rows: ReadonlyArray<LeaveRow>;
  showRequester?: boolean;
  busy: boolean;
  onDecide: (id: string, decision: "APPROVED" | "REJECTED" | "CANCELLED") => void;
}) {
  const { query, setQuery, rows: searchedRows, isFiltered: isSearching } = useFilter(rows, (row) => [
    row.requesterName, row.typeLabel, row.from, row.to, row.reason, row.decisionNote, row.status,
  ]);
  const [status, setStatus] = useState<"ALL" | LeaveRow["status"]>("ALL");
  const statuses = [...new Set(rows.map((row) => row.status))];
  const filteredRows = useMemo(
    () => searchedRows.filter((row) => status === "ALL" || row.status === status),
    [searchedRows, status],
  );
  const isFiltered = isSearching || status !== "ALL";

  return <>
    <TableToolbar
      search={query}
      onSearch={setQuery}
      placeholder={showRequester ? "Search employee, leave type, or date…" : "Search leave type, date, or status…"}
      label={showRequester ? "Search leave requests awaiting a decision" : "Search your leave requests"}
    >
      {statuses.length > 1 && <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span>Status</span>
        <select className="row-select" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="ALL">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>}
      {isFiltered && <button type="button" className="row-action" onClick={() => { setQuery(""); setStatus("ALL"); }}>Clear filters</button>}
    </TableToolbar>
    {filteredRows.length === 0
      ? <EmptyState message="No leave requests are recorded." filteredMessage="No leave requests match those filters." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
    <table className="matrix matrix--people">
      <thead>
        <tr>
          {showRequester && <th scope="col">Employee</th>}
          <th scope="col">Type</th><th scope="col">Dates</th><th scope="col">Days</th><th scope="col">Status</th><th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((row) => <tr key={row.id}>
          {showRequester && <th scope="row"><strong>{row.requesterName}</strong>{row.reason && <span>{row.reason}</span>}</th>}
          <td><span className="leave-type-pill" style={{ "--dot": row.colour } as CSSProperties}>{row.typeLabel}</span></td>
          <td>{row.from} → {row.to}</td>
          <td>{row.days}</td>
          <td>
            <StatusChip status={row.status} />
            {row.decisionNote && <span className="portal-muted">{row.decisionNote}</span>}
          </td>
          <td>
            <div className="row-actions">
              {row.canDecide && <>
                <button type="button" className="row-action" disabled={busy} onClick={() => onDecide(row.id, "APPROVED")}>Approve</button>
                <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => onDecide(row.id, "REJECTED")}>Reject</button>
              </>}
              {row.canCancel && <button type="button" className="row-action" disabled={busy} onClick={() => onDecide(row.id, "CANCELLED")}>Cancel</button>}
              {!row.canDecide && !row.canCancel && <span className="row-locked">—</span>}
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>}
  </>;
}
