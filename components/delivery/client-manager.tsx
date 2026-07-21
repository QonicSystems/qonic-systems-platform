"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_STATUSES } from "@/lib/delivery/validate";

type Row = { id: string; name: string; code: string; status: string; industry: string; owner: string; projectCount: number };
type Errors = Partial<Record<"name" | "code" | "status" | "website" | "ownerId", string>>;

export function ClientManager({ clients, owners, canManage }: {
  clients: ReadonlyArray<Row>;
  owners: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
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
    {canManage && <p><button type="button" className="button button-primary" onClick={() => setOpen(true)}>Add a client</button></p>}

    {clients.length === 0 ? <p className="portal-note">No clients yet.</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Client</th><th scope="col">Industry</th><th scope="col">Owner</th><th scope="col">Projects</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {clients.map((client) => <tr key={client.id}>
            <th scope="row"><strong>{client.name}</strong><span>{client.code}</span></th>
            <td>{client.industry || "—"}</td>
            <td>{client.owner}</td>
            <td>{client.projectCount}</td>
            <td><span className={`status-chip status-chip--${client.status.toLowerCase()}`}>{client.status.toLowerCase()}</span></td>
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
            <div>
              <label htmlFor="c-status">Status</label>
              <select id="c-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {CLIENT_STATUSES.map((status) => <option key={status} value={status}>{status.toLowerCase()}</option>)}
              </select>
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
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Add Client"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
