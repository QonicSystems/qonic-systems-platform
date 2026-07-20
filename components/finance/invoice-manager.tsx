"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; number: string; client: string; project: string; status: string; issued: string; due: string; total: string; outstanding: string; ageing: string };

export function InvoiceManager({ invoices, clients, projects, canManage, canRecordPayment, today, dueDefault }: {
  invoices: ReadonlyArray<Row>;
  clients: ReadonlyArray<{ id: string; name: string }>;
  projects: ReadonlyArray<{ id: string; name: string; clientId: string }>;
  canManage: boolean;
  canRecordPayment: boolean;
  /** Supplied by the server — reading the clock during render is impure. */
  today: string;
  dueDefault: string;
}) {
  const router = useRouter();
  const empty = { clientId: clients[0]?.id ?? "", projectId: "", issueDate: today, dueDate: dueDefault, taxPercent: "18", fromTimesheets: true, notes: "", currency: "INR" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [paying, setPaying] = useState<Row | null>(null);
  const [payment, setPayment] = useState({ amount: "", paidOn: today, method: "Bank transfer", reference: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (url: string, body: unknown) => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json() as { message?: string };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      if (res.ok) router.refresh();
      return res.ok;
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); return false; }
    finally { setBusy(false); }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await call("/api/invoices", { ...form, taxPercent: Number(form.taxPercent) })) { setForm(empty); setOpen(false); }
  };

  const clientProjects = projects.filter((p) => p.clientId === form.clientId);

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {canManage && <p><button type="button" className="button button-primary" onClick={() => setOpen(true)} disabled={clients.length === 0}>Raise an invoice</button></p>}

    {invoices.length === 0 ? <p className="portal-note">No invoices yet.</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice</th><th scope="col">Client</th><th scope="col">Due</th><th scope="col">Total</th><th scope="col">Outstanding</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {invoices.map((invoice) => <tr key={invoice.id}>
            <th scope="row"><strong>{invoice.number}</strong><span>{invoice.project} · issued {invoice.issued}</span></th>
            <td>{invoice.client}</td>
            <td>{invoice.due}{invoice.ageing !== "—" && invoice.ageing !== "current" && <span className="portal-muted text-over">{invoice.ageing} days late</span>}</td>
            <td>{invoice.total}</td>
            <td>{invoice.outstanding}</td>
            <td><span className={`status-chip status-chip--${invoice.status.toLowerCase().replace(/_/g, "-")}`}>{invoice.status.toLowerCase().replace(/_/g, " ")}</span></td>
            <td>
              <div className="row-actions">
                <a className="row-action" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer noopener">PDF</a>
                {canManage && invoice.status === "DRAFT" && <button type="button" className="row-action" disabled={busy} onClick={() => call(`/api/invoices/${invoice.id}`, { action: "send" })}>Issue</button>}
                {canManage && !["PAID", "VOID"].includes(invoice.status) && <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => call(`/api/invoices/${invoice.id}`, { action: "void" })}>Void</button>}
                {canRecordPayment && ["SENT", "PART_PAID", "OVERDUE"].includes(invoice.status) && <button type="button" className="row-action" disabled={busy} onClick={() => { setPaying(invoice); setPayment({ ...payment, amount: "" }); }}>Record payment</button>}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <div className="dialog dialog--wide">
        <h3 id="inv-title" className="dialog-title">Raise an invoice</h3>
        <form className="contact-form" noValidate onSubmit={create}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="i-client">Client <em>*</em></label>
              <select id="i-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, projectId: "" })}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="i-project">Project</label>
              <select id="i-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">None</option>
                {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label htmlFor="i-issue">Issue Date</label><input id="i-issue" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
            <div><label htmlFor="i-due">Due Date</label><input id="i-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><label htmlFor="i-tax">Tax %</label><input id="i-tax" inputMode="decimal" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.fromTimesheets} onChange={(e) => setForm({ ...form, fromTimesheets: e.target.checked })} />
                <span>Bill approved time on this project</span>
              </label>
              <p className="field-hint">Pulls every approved, billable hour that has not been invoiced before, one line per person. Draft timesheets are ignored.</p>
            </div>
            <div className="sm:col-span-2"><label htmlFor="i-notes">Notes</label><textarea id="i-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy || (form.fromTimesheets && !form.projectId)}>{busy ? "Raising…" : "Raise Invoice"}</button>
          </div>
        </form>
      </div>
    </div>}

    {paying && <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3 className="dialog-title">Record payment — {paying.number}</h3>
        <p className="portal-note">{paying.outstanding} outstanding.</p>
        <div className="contact-form mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="p-amt">Amount</label><input id="p-amt" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></div>
          <div><label htmlFor="p-date">Received On</label><input id="p-date" type="date" value={payment.paidOn} onChange={(e) => setPayment({ ...payment, paidOn: e.target.value })} /></div>
          <div><label htmlFor="p-method">Method</label><input id="p-method" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} /></div>
          <div><label htmlFor="p-ref">Reference</label><input id="p-ref" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setPaying(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-primary" disabled={busy || !payment.amount}
            onClick={async () => { if (await call(`/api/invoices/${paying.id}/payments`, payment)) setPaying(null); }}>Record</button>
        </div>
      </div>
    </div>}
  </div>;
}
