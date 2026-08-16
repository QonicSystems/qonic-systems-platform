"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/delivery/validate";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Row = { id: string; name: string; code: string; status: string; industry: string; owner: string; projectCount: number };
type Errors = Partial<Record<"name" | "code" | "status" | "website" | "ownerId", string>>;

export function ClientManager({ clients, owners, canManage }: {
  clients: ReadonlyArray<Row>;
  owners: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const { query, setQuery, rows, isFiltered } = useFilter(clients, (client) => [client.name, client.code, client.industry, client.status, client.owner]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", status: "ACTIVE", industry: "", website: "", ownerId: "", notes: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const response = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { message?: string; errors?: Errors };
      if (!response.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Added." });
      setForm({ name: "", code: "", status: "ACTIVE", industry: "", website: "", ownerId: "", notes: "" });
      setOpen(false);
      router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search clients…" label="Search clients">
      {canManage && <button type="button" className="button button-primary" onClick={() => setOpen(true)}>Add a client</button>}
    </TableToolbar>

    {rows.length === 0
      ? <EmptyState message="No clients yet." filteredMessage="Nothing matches that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Client</th><th scope="col">Industry</th><th scope="col">Owner</th><th scope="col">Projects</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {rows.map((client) => <tr key={client.id}>
            <th scope="row"><strong>{client.name}</strong><span>{client.code}</span></th>
            <td>{client.industry || "—"}</td>
            <td>{client.owner}</td>
            <td>{client.projectCount}</td>
            <td><StatusChip status={client.status} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="client-title">
      <div className="dialog dialog--wide">
        <h3 id="client-title" className="dialog-title">Add a client</h3>
        <form className="contact-form" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="c-name">Client Name <em>*</em></label>
              <input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={Boolean(errors.name)} />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="c-code">Short Code <em>*</em></label>
              <input id="c-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors.code)} placeholder="ACME" />
              {errors.code ? <p className="form-error">{errors.code}</p> : <p className="field-hint">Used to prefix project codes.</p>}
            </div>
            <div>
              <label htmlFor="c-industry">Industry</label>
              <input id="c-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
              <label htmlFor="c-status">Status</label>
              <select id="c-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {CLIENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CLIENT_STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            <div>
              <label htmlFor="c-website">Website</label>
              <input id="c-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-invalid={Boolean(errors.website)} placeholder="https://" />
              {errors.website && <p className="form-error">{errors.website}</p>}
            </div>
            <div>
              <label htmlFor="c-owner">Account Owner</label>
              <select id="c-owner" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Unassigned</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Add Client"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
