"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_ARCHIVED_STATUS, CLIENT_STATUSES, CLIENT_STATUS_LABELS, EMPLOYMENT_TYPES, WORK_ARRANGEMENTS } from "@/lib/delivery/validate";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  isPrimary: boolean;
};

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
  vendorId: string;
  vendor: string;
  globalCandidateId: string;
  globalCandidate: string;
  employmentType: string;
  workArrangement: string;
  startDate: string;
  endDate: string;
  actualClientRate: string;
  rateCurrency: string;
  globalCandidateCommissionPercent: string;
  vendorCommissionPercent: string;
  projectCount: number;
  jobCount: number;
  invoiceCount: number;
  contacts: ReadonlyArray<Contact>;
};
type Errors = Partial<Record<"name" | "code" | "status" | "website" | "ownerId" | "vendorId" | "globalCandidateId" | "employmentType" | "workArrangement" | "startDate" | "endDate" | "actualClientRate" | "rateCurrency" | "globalCandidateCommissionPercent" | "vendorCommissionPercent" | "projectName", string>>;
type Form = {
  name: string; code: string; status: string; industry: string; website: string; ownerId: string; notes: string;
  vendorId: string; globalCandidateId: string; employmentType: string; workArrangement: string;
  startDate: string; endDate: string; actualClientRate: string; rateCurrency: string;
  globalCandidateCommissionPercent: string; vendorCommissionPercent: string; projectName: string;
};

const blank: Form = { name: "", code: "", status: "ACTIVE", industry: "", website: "", ownerId: "", notes: "", vendorId: "", globalCandidateId: "", employmentType: "", workArrangement: "", startDate: "", endDate: "", actualClientRate: "", rateCurrency: "USD", globalCandidateCommissionPercent: "", vendorCommissionPercent: "", projectName: "" };

export function ClientManager({ clients, owners, vendors, globalCandidates, canManage }: {
  clients: ReadonlyArray<Row>;
  owners: ReadonlyArray<{ id: string; name: string }>;
  vendors: ReadonlyArray<{ id: string; name: string }>;
  globalCandidates: ReadonlyArray<{ id: string; name: string }>;
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

  const { query, setQuery, rows, isFiltered } = useFilter(visible, (client) => [client.name, client.code, client.industry, client.status, client.owner, client.vendor, client.globalCandidate]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [contactsId, setContactsId] = useState<string | null>(null);
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
      vendorId: client.vendorId, globalCandidateId: client.globalCandidateId,
      employmentType: client.employmentType, workArrangement: client.workArrangement,
      startDate: client.startDate, endDate: client.endDate, actualClientRate: client.actualClientRate,
      rateCurrency: client.rateCurrency, globalCandidateCommissionPercent: client.globalCandidateCommissionPercent,
      vendorCommissionPercent: client.vendorCommissionPercent, projectName: "",
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

  // Read through the live prop so the panel refreshes after router.refresh().
  const contactsFor = clients.find((c) => c.id === contactsId) ?? null;

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
          <th scope="col">Client / Job</th><th scope="col">Vendor</th><th scope="col">Global Candidate</th><th scope="col">Terms</th><th scope="col">Owner</th>
          <th scope="col">Projects</th><th scope="col">Status</th>
          {canManage && <th scope="col">Actions</th>}
        </tr></thead>
        <tbody>
          {rows.map((client) => <tr key={client.id} className={client.status === CLIENT_ARCHIVED_STATUS ? "opacity-70" : undefined}>
            <th scope="row"><strong>{client.name}</strong><span>{client.code}</span></th>
            <td>{client.vendor}</td>
            <td>{client.globalCandidate}</td>
            <td>{client.employmentType ? <><span className="matrix-cell-primary">{client.employmentType.replace("_", " ")} · {client.workArrangement || "—"}</span>{client.actualClientRate && <span className="matrix-cell-subline portal-muted">{client.rateCurrency} {client.actualClientRate}/hr</span>}</> : <span className="matrix-cell-primary">{client.industry || "—"}</span>}</td>
            <td>{client.owner}</td>
            <td>{client.projectCount}</td>
            <td><StatusChip status={client.status} label={CLIENT_STATUS_LABELS[client.status]} /></td>
            {canManage && <td>
              <div className="row-actions flex flex-wrap gap-1">
                <button type="button" className="row-action" onClick={() => startEdit(client)} disabled={busy}>Edit</button>
                <button
                  type="button"
                  className="row-action"
                  onClick={() => { setContactsId(client.id); setNotice(null); }}
                  disabled={busy}
                  title="The people to talk to at this client"
                >
                  Contacts ({client.contacts.length})
                </button>
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

    {contactsFor && <ContactsDialog
      client={contactsFor}
      busy={busy}
      onClose={() => setContactsId(null)}
      onCall={act}
    />}

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
            <div className="sm:col-span-2 border-t border-[#e7e4da] pt-4 mt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-[#4f4f4f]">Procured job terms</p>
              <p className="field-hint">Existing data is reused to create the internal project automatically. Leave blank for a general client record.</p>
            </div>
            <div>
              <label htmlFor="c-candidate">Global Candidate</label>
              <select id="c-candidate" value={form.globalCandidateId} onChange={(e) => setForm({ ...form, globalCandidateId: e.target.value })} aria-invalid={Boolean(errors.globalCandidateId)}>
                <option value="">Not a procured Global Candidate job</option>
                {globalCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
              {errors.globalCandidateId && <p className="form-error">{errors.globalCandidateId}</p>}
            </div>
            <div>
              <label htmlFor="c-vendor">Vendor</label>
              <select id="c-vendor" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} aria-invalid={Boolean(errors.vendorId)}>
                <option value="">No vendor selected</option>
                {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
              {errors.vendorId && <p className="form-error">{errors.vendorId}</p>}
            </div>
            <div>
              <label htmlFor="c-employment">Employment Type</label>
              <select id="c-employment" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} aria-invalid={Boolean(errors.employmentType)}>
                <option value="">Select type</option>
                {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{type === "FULL_TIME" ? "Full Time" : type}</option>)}
              </select>
              {errors.employmentType && <p className="form-error">{errors.employmentType}</p>}
            </div>
            <div>
              <label htmlFor="c-arrangement">Work Arrangement</label>
              <select id="c-arrangement" value={form.workArrangement} onChange={(e) => setForm({ ...form, workArrangement: e.target.value })} aria-invalid={Boolean(errors.workArrangement)}>
                <option value="">Select arrangement</option>
                {WORK_ARRANGEMENTS.map((arrangement) => <option key={arrangement} value={arrangement}>{arrangement === "WFO" ? "WFO" : arrangement[0] + arrangement.slice(1).toLowerCase()}</option>)}
              </select>
              {errors.workArrangement && <p className="form-error">{errors.workArrangement}</p>}
            </div>
            <div>
              <label htmlFor="c-start">Start Date</label>
              <input id="c-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} aria-invalid={Boolean(errors.startDate)} />
              {errors.startDate && <p className="form-error">{errors.startDate}</p>}
            </div>
            <div>
              <label htmlFor="c-end">End Date</label>
              <input id="c-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-invalid={Boolean(errors.endDate)} />
              {errors.endDate && <p className="form-error">{errors.endDate}</p>}
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <div>
                <label htmlFor="c-currency">Currency</label>
                <select id="c-currency" value={form.rateCurrency} onChange={(e) => setForm({ ...form, rateCurrency: e.target.value })}>
                  {["USD", "INR", "GBP", "EUR", "AED"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="c-rate">Actual Client Rate / hour</label>
                <input id="c-rate" inputMode="decimal" value={form.actualClientRate} onChange={(e) => setForm({ ...form, actualClientRate: e.target.value })} aria-invalid={Boolean(errors.actualClientRate)} placeholder="80" />
                {errors.actualClientRate && <p className="form-error">{errors.actualClientRate}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="c-project-name">Internal Project Name</label>
              <input id="c-project-name" value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} aria-invalid={Boolean(errors.projectName)} placeholder="Java Delivery — ACME" />
              {errors.projectName && <p className="form-error">{errors.projectName}</p>}
            </div>
            {form.employmentType === "C2C" && <>
              <div>
                <label htmlFor="c-gc-commission">Global Candidate Commission %</label>
                <input id="c-gc-commission" inputMode="decimal" value={form.globalCandidateCommissionPercent} onChange={(e) => setForm({ ...form, globalCandidateCommissionPercent: e.target.value })} aria-invalid={Boolean(errors.globalCandidateCommissionPercent)} placeholder="Policy default" />
                {errors.globalCandidateCommissionPercent && <p className="form-error">{errors.globalCandidateCommissionPercent}</p>}
              </div>
              <div>
                <label htmlFor="c-vendor-commission">Vendor Commission %</label>
                <input id="c-vendor-commission" inputMode="decimal" value={form.vendorCommissionPercent} onChange={(e) => setForm({ ...form, vendorCommissionPercent: e.target.value })} aria-invalid={Boolean(errors.vendorCommissionPercent)} placeholder="Policy default" />
                {errors.vendorCommissionPercent && <p className="form-error">{errors.vendorCommissionPercent}</p>}
              </div>
            </>}
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
 * The people to talk to at a client.
 *
 * ClientContact has been in the schema from the start and the only code that
 * touched it was the delete cascade — you could record a company and not a
 * single human being at it. Exactly one contact is primary; promoting one
 * demotes the rest, which the API enforces.
 */
function ContactsDialog({ client, busy, onClose, onCall }: {
  client: Row;
  busy: boolean;
  onClose: () => void;
  onCall: (url: string, init: RequestInit) => Promise<boolean>;
}) {
  const blank = { name: "", email: "", phone: "", title: "", isPrimary: false };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setForm({ name: contact.name, email: contact.email, phone: contact.phone, title: contact.title, isPrimary: contact.isPrimary });
  };
  const reset = () => { setEditingId(null); setForm(blank); };

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="contacts-title">
    <div className="dialog dialog--wide">
      <h3 id="contacts-title" className="dialog-title">Contacts — {client.name}</h3>

      <section className="panel-block">
        <div className="panel-block__head"><h4>{client.contacts.length} on record</h4></div>
        {client.contacts.length === 0
          ? <p className="portal-muted">Nobody recorded yet.</p>
          : <ul className="timeline timeline--tight">
              {client.contacts.map((contact) => <li key={contact.id} className="timeline__item">
                <div className="timeline__head">
                  <strong>{contact.name}</strong>
                  {contact.isPrimary && <span className="pill pill--warn">Primary</span>}
                </div>
                <p className="timeline__meta">
                  {[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ") || "No details"}
                </p>
                <div className="row-actions flex flex-wrap gap-1">
                  <button type="button" className="row-action" disabled={busy} onClick={() => startEdit(contact)}>Edit</button>
                  {!contact.isPrimary && (
                    <button
                      type="button"
                      className="row-action"
                      disabled={busy}
                      onClick={() => onCall(`/api/clients/${client.id}/contacts`, {
                        method: "PATCH",
                        body: JSON.stringify({ contactId: contact.id, ...contact, isPrimary: true }),
                      })}
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    className="row-action row-action--danger"
                    disabled={busy}
                    onClick={() => onCall(`/api/clients/${client.id}/contacts?contactId=${encodeURIComponent(contact.id)}`, { method: "DELETE" })}
                  >
                    Remove
                  </button>
                </div>
              </li>)}
            </ul>}
      </section>

      <section className="panel-block">
        <div className="panel-block__head"><h4>{editingId ? "Edit contact" : "Add a contact"}</h4></div>
        <div className="contact-form panel-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ct-name">Full name <em>*</em></label>
              <input id="ct-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ct-title">Job title</label>
              <input id="ct-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Head of Engineering" />
            </div>
            <div>
              <label htmlFor="ct-email">Email</label>
              <input id="ct-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ct-phone">Phone</label>
              <input id="ct-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} />
                <span>Primary contact for this client</span>
              </label>
            </div>
          </div>
          <div className="dialog-actions">
            {editingId && <button type="button" className="button button-outline" onClick={reset} disabled={busy}>Cancel edit</button>}
            <button
              type="button"
              className="button button-primary"
              disabled={busy || form.name.trim().length < 2}
              onClick={async () => {
                const ok = editingId
                  ? await onCall(`/api/clients/${client.id}/contacts`, { method: "PATCH", body: JSON.stringify({ contactId: editingId, ...form }) })
                  : await onCall(`/api/clients/${client.id}/contacts`, { method: "POST", body: JSON.stringify(form) });
                if (ok) reset();
              }}
            >
              {busy ? "Saving…" : editingId ? "Save contact" : "Add contact"}
            </button>
          </div>
        </div>
      </section>

      <div className="dialog-actions">
        <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </div>
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
