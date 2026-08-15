"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type HolidayRow = { id: string; date: string; label: string; year: number; past: boolean };

type Errors = Partial<Record<"date" | "name", string>>;

export function HolidayTable({ holidays, canManage }: {
  holidays: ReadonlyArray<HolidayRow>;
  canManage: boolean;
}) {
  const router = useRouter();
  const { query, setQuery, rows, isFiltered } = useFilter(holidays, (row) => [row.label, row.date, String(row.year)]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search holidays…" label="Search holidays">
      {canManage && <button type="button" className="button button-primary" onClick={() => { setAdding(true); setNotice(null); }} disabled={busy}>
        Add Holiday
      </button>}
    </TableToolbar>

    {rows.length === 0
      ? <EmptyState message="No holidays recorded. Leave requests will treat every weekday as a working day." filteredMessage="No holidays match that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead><tr><th scope="col">Date</th><th scope="col">Holiday</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead>
            <tbody>
              {rows.map((holiday) => <tr key={holiday.id}>
                <th scope="row"><strong>{holiday.date}</strong></th>
                <td>{holiday.label}</td>
                <td>{holiday.past ? <span className="portal-muted">Passed</span> : "Upcoming"}</td>
                {canManage && <td>
                  <div className="row-actions">
                    <button type="button" className="row-action row-action--danger" disabled={busy}
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
