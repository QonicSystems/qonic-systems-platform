"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_ARCHIVED_STATUS, CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/delivery/validate";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Row = {
  id: string;
  name: string;
  code: string;
  status: string;
  industry: string;
  website: string;
  notes: string;
  ownerId: string;
  owner: string;
  projectCount: number;
  jobCount: number;
  invoiceCount: number;
};
type Errors = Partial<Record<"name" | "code" | "status" | "website" | "ownerId", string>>;
type Form = { name: string; code: string; status: string; industry: string; website: string; ownerId: string; notes: string };

const blank: Form = { name: "", code: "", status: "ACTIVE", industry: "", website: "", ownerId: "", notes: "" };

export function ClientManager({ clients, owners, canManage }: {
  clients: ReadonlyArray<Row>;
  owners: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"CURRENT" | "ARCHIVED" | "ALL">("CURRENT");

  const counts = {
    CURRENT: clients.filter((c) => c.status !== CLIENT_ARCHIVED_STATUS).length,
    ARCHIVED: clients.filter((c) => c.status === CLIENT_ARCHIVED_STATUS).length,
    ALL: clients.length,
  };
  const visible = useMemo(() => {
    if (statusFilter === "ALL") return clients;
    if (statusFilter === "ARCHIVED") return clients.filter((c) => c.status === CLIENT_ARCHIVED_STATUS);
    return clients.filter((c) => c.status !== CLIENT_ARCHIVED_STATUS);
  }, [clients, statusFilter]);

  const { query, setQuery, rows, isFiltered } = useFilter(visible, (client) => [client.name, client.code, client.industry, client.status, client.owner]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const url = editing ? `/api/clients/${editing.id}` : "/api/clients";
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json() as { message?: string; errors?: Errors };
      if (!response.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Saved." });
      setForm(blank);
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  /** Status changes and deletes — one place that surfaces the server's reason. */
  const act = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that request." });
        if (response.status === 404 || response.status === 409) router.refresh();
        return false;
      }
      setNotice({ tone: "success", text: result.message ?? "Updated." });
      router.refresh();
      return true;
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return false;
    } finally { setBusy(false); }
  };

  const toggleArchive = (client: Row) =>
    act(`/api/clients/${client.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: client.status === CLIENT_ARCHIVED_STATUS ? "ACTIVE" : CLIENT_ARCHIVED_STATUS }),
    });

  const remove = async (client: Row) => {
    if (await act(`/api/clients/${client.id}`, { method: "DELETE" })) setDeleting(null);
  };

  const startEdit = (client: Row) => {
    setEditing(client);
    setForm({
      name: client.name, code: client.code, status: client.status,
      industry: client.industry, website: client.website,
      ownerId: client.ownerId, notes: client.notes,
    });
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const startAdd = () => {
    setEditing(null);
    setForm(blank);
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const closeDialog = () => { setOpen(false); setEditing(null); };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="filter-bar" role="group" aria-label="Filter by status">
      <span className="filter-group__label">Status</span>
      {(["CURRENT", "ARCHIVED", "ALL"] as const).map((key) => {
        const selected = statusFilter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            aria-pressed={selected}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selected ? "bg-[#111111] text-white shadow-sm" : "bg-[#f8f7f3] text-[#4f4f4f] hover:bg-[#eeece4] border border-[#e7e4da]"
            }`}
          >
            <span>{key === "CURRENT" ? "Current" : key === "ARCHIVED" ? "Archived" : "All"}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
              selected ? "bg-[#ffd700] text-[#111111] font-bold" : "bg-black/10 text-[#6b6b6b]"
            }`}>{counts[key]}</span>
          </button>
        );
      })}
    </div>

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search clients…" label="Search clients">
      {canManage && <button type="button" className="button button-primary" onClick={startAdd}>Add a client</button>}
    </TableToolbar>

    {rows.length === 0
      ? <EmptyState
          message={statusFilter === "ARCHIVED" ? "No archived clients." : "No clients yet."}
          filteredMessage="Nothing matches that search."
          isFiltered={isFiltered || statusFilter !== "CURRENT"}
        />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr>
          <th scope="col">Client</th><th scope="col">Industry</th><th scope="col">Owner</th>
          <th scope="col">Projects</th><th scope="col">Status</th>
          {canManage && <th scope="col">Actions</th>}
        </tr></thead>
        <tbody>
          {rows.map((client) => <tr key={client.id} className={client.status === CLIENT_ARCHIVED_STATUS ? "opacity-70" : undefined}>
            <th scope="row"><strong>{client.name}</strong><span>{client.code}</span></th>
            <td>{client.industry || "—"}</td>
            <td>{client.owner}</td>
            <td>{client.projectCount}</td>
            <td><StatusChip status={client.status} label={CLIENT_STATUS_LABELS[client.status]} /></td>
            {canManage && <td>
              <div className="row-actions flex flex-wrap gap-1">
                <button type="button" className="row-action" onClick={() => startEdit(client)} disabled={busy}>Edit</button>
                <button
                  type="button"
                  className="row-action"
                  onClick={() => toggleArchive(client)}
                  disabled={busy}
                  title={client.status === CLIENT_ARCHIVED_STATUS
                    ? "Return this client to the active list"
                    : "Archive — keeps every project, job and invoice"}
                >
                  {client.status === CLIENT_ARCHIVED_STATUS ? "Restore" : "Archive"}
                </button>
                <button
                  type="button"
                  className="row-action row-action--danger"
                  onClick={() => { setDeleting(client); setNotice(null); }}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </td>}
          </tr>)}
        </tbody>
      </table>
    </div>}

    {deleting && <DeleteDialog client={deleting} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="client-title">
      <div className="dialog dialog--wide">
        <h3 id="client-title" className="dialog-title">{editing ? `Edit ${editing.name}` : "Add a client"}</h3>
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
            <div>
              <label htmlFor="c-status">Status</label>
              <select id="c-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {CLIENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CLIENT_STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
              {errors.status && <p className="form-error">{errors.status}</p>}
            </div>
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
            <button type="button" className="button button-outline" onClick={closeDialog} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save Changes" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}

/**
 * Names what would be destroyed. The counts come from the row rather than the
 * failed request, so the warning is on screen before the delete is attempted
 * instead of arriving as a 409 afterwards.
 */
function DeleteDialog({ client, busy, onCancel, onConfirm }: {
  client: Row;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blockers = [
    client.projectCount > 0 ? `${client.projectCount} project${client.projectCount === 1 ? "" : "s"}` : null,
    client.jobCount > 0 ? `${client.jobCount} job${client.jobCount === 1 ? "" : "s"}` : null,
    client.invoiceCount > 0 ? `${client.invoiceCount} invoice${client.invoiceCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="client-del-title">
    <div className="dialog">
      <h3 id="client-del-title" className="dialog-title">Permanently delete {client.name}?</h3>
      {blockers.length > 0 ? (
        <>
          <p className="portal-note">
            <strong>{client.name}</strong> currently has <strong>{blockers.join(", ")}</strong> attached.
          </p>
          <p className="portal-note text-amber-900 font-medium bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            Deleting this client will permanently erase the client organization and cleanly remove its associated records. This action cannot be undone.
          </p>
        </>
      ) : (
        <p className="portal-note">
          This permanently removes <strong>{client.name}</strong> and its contacts. It cannot be undone.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button button-outline" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="button button-danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </div>
  </div>;
}
