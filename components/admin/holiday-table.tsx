"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";

export type HolidayRow = { id: string; date: string; label: string; year: number; past: boolean };

type Errors = Partial<Record<"date" | "name", string>>;

export function HolidayTable({ holidays, canManage }: {
  holidays: ReadonlyArray<HolidayRow>;
  canManage: boolean;
}) {
  const router = useRouter();
  const currentYearStr = String(new Date().getFullYear());
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Available unique years in dataset
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(holidays.map((h) => h.year))).sort((a, b) => a - b);
    return years;
  }, [holidays]);

  // Multi-dimensional filter (Search + Year + Status)
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return holidays.filter((h) => {
      // 1. Text search
      if (needle) {
        const haystack = `${h.label} ${h.date} ${h.year}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      // 2. Year filter
      if (selectedYear !== "all" && String(h.year) !== selectedYear) {
        return false;
      }
      // 3. Status filter
      if (selectedStatus === "upcoming" && h.past) return false;
      if (selectedStatus === "passed" && !h.past) return false;

      return true;
    });
  }, [holidays, query, selectedYear, selectedStatus]);

  const isFiltered = query.trim().length > 0 || selectedYear !== "all" || selectedStatus !== "all";

  const clearFilters = () => {
    setQuery("");
    setSelectedYear("all");
    setSelectedStatus("all");
  };

  const send = async (init: RequestInit): Promise<{ ok: boolean; errors?: Errors }> => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/holidays", { headers: { "Content-Type": "application/json" }, ...init });
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: Errors };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that action." });
        return { ok: false, errors: result.errors };
      }
      setNotice({ tone: "success", text: result.message ?? "Done." });
      router.refresh();
      return { ok: true };
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return { ok: false };
    } finally { setBusy(false); }
  };

  const syncIndianHolidays = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/holidays/sync", { method: "POST" });
      const result = await res.json() as { message?: string };
      if (res.ok) {
        setNotice({ tone: "success", text: result.message ?? "Synced Indian public holidays in real time." });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: result.message ?? "Unable to sync holidays." });
      }
    } catch {
      setNotice({ tone: "error", text: "Failed to connect to holiday service." });
    } finally {
      setSyncing(false);
    }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search holidays…" label="Search holidays">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="button button-outline"
            onClick={syncIndianHolidays}
            disabled={busy || syncing}
          >
            {syncing ? "Syncing Holidays…" : "Sync India Holidays (API)"}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => { setAdding(true); setNotice(null); }}
            disabled={busy || syncing}
          >
            Add Holiday
          </button>
        </div>
      )}
    </TableToolbar>

    {/* Filter controls row */}
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="filter-year" className="text-xs font-bold text-ink-muted uppercase tracking-wider">Year:</label>
        <select
          id="filter-year"
          className="search-input !w-auto !py-1.5 !px-3 text-sm"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="all">All Years</option>
          {availableYears.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="filter-status" className="text-xs font-bold text-ink-muted uppercase tracking-wider">Status:</label>
        <select
          id="filter-status"
          className="search-input !w-auto !py-1.5 !px-3 text-sm"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="passed">Passed</option>
        </select>
      </div>

      {isFiltered && (
        <button
          type="button"
          className="row-action text-xs font-medium text-accent-deep hover:text-ink"
          onClick={clearFilters}
        >
          Clear filters ({filteredRows.length} of {holidays.length})
        </button>
      )}
    </div>

    {filteredRows.length === 0
      ? <EmptyState message="No holidays recorded. Leave requests will treat every weekday as a working day." filteredMessage="No holidays match those filters." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead><tr><th scope="col">Date</th><th scope="col">Holiday</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead>
            <tbody>
              {filteredRows.map((holiday) => <tr key={holiday.id}>
                <th scope="row"><strong>{holiday.date}</strong></th>
                <td>{holiday.label}</td>
                <td>{holiday.past ? <span className="portal-muted">Passed</span> : <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Upcoming</span>}</td>
                {canManage && <td>
                  <div className="row-actions">
                    <button type="button" className="row-action row-action--danger" disabled={busy || syncing}
                      onClick={() => send({ method: "DELETE", body: JSON.stringify({ id: holiday.id }) })}>Remove</button>
                  </div>
                </td>}
              </tr>)}
            </tbody>
          </table>
        </div>}

    {adding && <AddHoliday busy={busy} onClose={() => setAdding(false)} onSave={async (payload) => {
      const result = await send({ method: "POST", body: JSON.stringify(payload) });
      if (result.ok) setAdding(false);
      return result.errors ?? {};
    }} />}
  </div>;
}

function AddHoliday({ busy, onClose, onSave }: {
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => Promise<Errors>;
}) {
  const [data, setData] = useState({ date: "", name: "" });
  const [errors, setErrors] = useState<Errors>({});

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="holiday-title">
    <div className="dialog">
      <h3 id="holiday-title" className="dialog-title">Add a public holiday</h3>
      <form className="contact-form" noValidate onSubmit={async (event) => { event.preventDefault(); setErrors(await onSave(data)); }}>
        <div>
          <label htmlFor="holiday-date">Date <em>*</em></label>
          <input id="holiday-date" type="date" autoFocus value={data.date}
            onChange={(event) => { setData((c) => ({ ...c, date: event.target.value })); setErrors((c) => ({ ...c, date: undefined })); }}
            aria-invalid={Boolean(errors.date)} />
          {errors.date && <p className="form-error">{errors.date}</p>}
        </div>
        <div className="mt-5">
          <label htmlFor="holiday-name">Name <em>*</em></label>
          <input id="holiday-name" value={data.name}
            onChange={(event) => { setData((c) => ({ ...c, name: event.target.value })); setErrors((c) => ({ ...c, name: undefined })); }}
            aria-invalid={Boolean(errors.name)} />
          {errors.name ? <p className="form-error">{errors.name}</p>
            : <p className="field-hint">Leave requests spanning this date will not count it as a working day.</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Adding…" : "Add Holiday"}</button>
        </div>
      </form>
    </div>
  </div>;
}
