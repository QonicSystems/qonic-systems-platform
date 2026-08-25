"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Job = {
  id: string; client: string; candidate: string; projects: string; employmentType: string; workArrangement: string;
  startDate: string; endDate: string; clientRate: string; commission: { vendor: string; candidate: string } | null;
  invoiceAmount: string; amountPaid: string; outstanding: string; paymentStatus: string;
};
type Reminder = { id: string; channel: string; recipient: string; message: string; sentAt: string; sentBy: string };
type Vendor = {
  id: string; name: string; contactName: string; email: string; phone: string; address: string; website: string; status: string; notes: string;
  jobs: Job[]; reminders: Reminder[]; reminderCount: number;
};
type Errors = Record<string, string>;
const blank = { name: "", contactName: "", email: "", phone: "", address: "", website: "", status: "ACTIVE", notes: "" };

export function VendorDashboard({ vendors, defaultGlobalCandidateCommissionPercent, defaultVendorCommissionPercent, canManage }: {
  vendors: ReadonlyArray<Vendor>;
  defaultGlobalCandidateCommissionPercent: number;
  defaultVendorCommissionPercent: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const { query, setQuery, rows, isFiltered } = useFilter(vendors, (vendor) => [vendor.name, vendor.contactName, vendor.email, vendor.phone, vendor.status, ...vendor.jobs.flatMap((job) => [job.client, job.candidate])]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [policy, setPolicy] = useState({ global: String(defaultGlobalCandidateCommissionPercent), vendor: String(defaultVendorCommissionPercent) });
  const selected = vendors.find((vendor) => vendor.id === selectedId) ?? null;
  const jobCount = useMemo(() => vendors.reduce((sum, vendor) => sum + vendor.jobs.length, 0), [vendors]);

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string; errors?: Errors; whatsappUrl?: string | null };
      if (!response.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return null; }
      setNotice({ tone: "success", text: result.message ?? "Saved." });
      router.refresh();
      return result;
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); return null; }
    finally { setBusy(false); }
  };
  const startAdd = () => { setEditing(null); setForm(blank); setErrors({}); setOpen(true); };
  const startEdit = (vendor: Vendor) => { setEditing(vendor); setForm({ name: vendor.name, contactName: vendor.contactName, email: vendor.email, phone: vendor.phone, address: vendor.address, website: vendor.website, status: vendor.status, notes: vendor.notes }); setErrors({}); setOpen(true); };
  const save = async (event: FormEvent) => { event.preventDefault(); const result = await call(editing ? `/api/vendors/${editing.id}` : "/api/vendors", editing ? "PATCH" : "POST", form); if (result) { setOpen(false); setEditing(null); } };
  const sendReminder = async (vendor: Vendor, channel: "EMAIL" | "WHATSAPP", clientId?: string) => {
    const result = await call(`/api/vendors/${vendor.id}/reminders`, "POST", { channel, clientId });
    if (result?.whatsappUrl) window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <div className="portal-grid mb-5">
      <article className="portal-card"><span className="portal-stat">{vendors.length}</span><p>Vendors</p></article>
      <article className="portal-card"><span className="portal-stat">{jobCount}</span><p>Associated jobs</p></article>
      <article className="portal-card"><span className="portal-stat">{vendors.reduce((sum, vendor) => sum + vendor.reminderCount, 0)}</span><p>Reminders sent</p></article>
    </div>
    {canManage && <section className="c2c-settings mb-5">
      <div className="c2c-settings__header"><div><p className="eyebrow">Commission policy</p><h2 className="portal-section-title">C2C defaults</h2><p className="portal-note">These percentages are used when a new contractor-to-contractor job is created.</p></div><span className="c2c-settings__badge">Applies to new jobs</span></div>
      <div className="c2c-settings__controls">
        <div className="percentage-field"><label htmlFor="policy-global">Global Candidate</label><div className="percentage-input"><input id="policy-global" inputMode="decimal" value={policy.global} onChange={(e) => setPolicy({ ...policy, global: e.target.value })} /><span>%</span></div><p>Candidate commission</p></div>
        <div className="percentage-field"><label htmlFor="policy-vendor">Vendor</label><div className="percentage-input"><input id="policy-vendor" inputMode="decimal" value={policy.vendor} onChange={(e) => setPolicy({ ...policy, vendor: e.target.value })} /><span>%</span></div><p>Vendor commission</p></div>
        <button type="button" className="button button-primary c2c-settings__save" disabled={busy} onClick={() => call("/api/commission-policy", "PATCH", { defaultGlobalCandidateCommissionPercent: Number(policy.global), defaultVendorCommissionPercent: Number(policy.vendor) })}>Save defaults</button>
      </div>
      <p className="c2c-settings__note">These defaults apply to new C2C jobs. Existing agreements keep their original commission snapshot.</p>
    </section>}
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search vendors, candidates, or jobs…" label="Search vendors">
      {canManage && <button type="button" className="button button-primary" onClick={startAdd}>Add vendor</button>}
    </TableToolbar>
    {rows.length === 0 ? <EmptyState message="No vendors yet." filteredMessage="Nothing matches that search." isFiltered={isFiltered} /> : <div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Vendor</th><th scope="col">Contact</th><th scope="col">Jobs</th><th scope="col">Reminders</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
      {rows.map((vendor) => <tr key={vendor.id}><th scope="row"><strong>{vendor.name}</strong><span>{vendor.address || "—"}</span></th><td><span className="matrix-cell-primary">{vendor.contactName || "—"}</span><span className="matrix-cell-subline portal-muted">{vendor.email || vendor.phone || "No contact details"}</span></td><td>{vendor.jobs.length}</td><td>{vendor.reminderCount}</td><td><StatusChip status={vendor.status} /></td><td><div className="row-actions flex flex-wrap gap-1"><button type="button" className="row-action" onClick={() => setSelectedId(vendor.id)}>Open</button>{canManage && <button type="button" className="row-action" onClick={() => startEdit(vendor)} disabled={busy}>Edit</button>}{canManage && <button type="button" className="row-action" onClick={() => sendReminder(vendor, "EMAIL")} disabled={busy || !vendor.email}>Email reminder</button>}{canManage && <button type="button" className="row-action" onClick={() => sendReminder(vendor, "WHATSAPP")} disabled={busy || !vendor.phone}>WhatsApp</button>}</div></td></tr>)}
    </tbody></table></div>}
    {selected && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="vendor-detail-title"><div className="dialog dialog--wide"><h3 id="vendor-detail-title" className="dialog-title">{selected.name}</h3><p className="portal-note">{[selected.contactName, selected.email, selected.phone, selected.website].filter(Boolean).join(" · ") || "No contact details"}</p><section className="panel-block"><div className="panel-block__head"><h4>Vendor jobs</h4></div>{selected.jobs.length === 0 ? <p className="portal-muted">No associated client jobs.</p> : <div className="matrix-scroll"><table className="matrix"><thead><tr><th scope="col">Client / Candidate</th><th scope="col">Project / terms</th><th scope="col">Rate / commission</th><th scope="col">Invoice</th><th scope="col">Paid / outstanding</th><th scope="col">Status</th><th scope="col">Reminder</th></tr></thead><tbody>{selected.jobs.map((job) => <tr key={job.id}><th scope="row">{job.client}<span>{job.candidate}</span></th><td>{job.projects}<span>{job.employmentType} · {job.workArrangement} · {job.startDate} → {job.endDate}</span></td><td><span className="matrix-cell-primary">{job.clientRate}</span><span className="matrix-cell-subline">{job.commission?.vendor ?? "—"}</span><span className="matrix-cell-subline">{job.commission?.candidate ?? "—"}</span></td><td>{job.invoiceAmount}</td><td><span className="matrix-cell-primary">{job.amountPaid}</span><span className="matrix-cell-subline">{job.outstanding}</span></td><td>{job.paymentStatus}</td><td>{canManage && <div className="row-actions"><button type="button" className="row-action" disabled={busy || !selected.email} onClick={() => sendReminder(selected, "EMAIL", job.id)}>Email</button><button type="button" className="row-action" disabled={busy || !selected.phone} onClick={() => sendReminder(selected, "WHATSAPP", job.id)}>WhatsApp</button></div>}</td></tr>)}</tbody></table></div>}</section><section className="panel-block"><div className="panel-block__head"><h4>Reminder history ({selected.reminderCount})</h4></div>{selected.reminders.length === 0 ? <p className="portal-muted">No reminders sent.</p> : <ul className="timeline timeline--tight">{selected.reminders.map((reminder) => <li key={reminder.id} className="timeline__item"><div className="timeline__head"><strong>{reminder.channel}</strong><span>{new Date(reminder.sentAt).toLocaleString("en-GB")}</span></div><p className="timeline__meta">{reminder.recipient} · sent by {reminder.sentBy}</p><p className="timeline__note">{reminder.message}</p></li>)}</ul>}</section><div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => setSelectedId(null)}>Close</button></div></div></div>}
    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="vendor-title"><div className="dialog dialog--wide"><h3 id="vendor-title" className="dialog-title">{editing ? `Edit ${editing.name}` : "Add vendor"}</h3><form className="contact-form" noValidate onSubmit={save}><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="v-name">Vendor Company <em>*</em></label><input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={Boolean(errors.name)} />{errors.name && <p className="form-error">{errors.name}</p>}</div><div><label htmlFor="v-contact">Contact Name</label><input id="v-contact" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div><div><label htmlFor="v-email">Email</label><input id="v-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={Boolean(errors.email)} />{errors.email && <p className="form-error">{errors.email}</p>}</div><div><label htmlFor="v-phone">Phone / WhatsApp</label><input id="v-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div><label htmlFor="v-website">Website</label><input id="v-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-invalid={Boolean(errors.website)} />{errors.website && <p className="form-error">{errors.website}</p>}</div><div><label htmlFor="v-status">Status</label><select id="v-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["ACTIVE", "PROSPECT", "INACTIVE", "ARCHIVED"].map((status) => <option key={status} value={status}>{status}</option>)}</select></div><div className="sm:col-span-2"><label htmlFor="v-address">Address</label><input id="v-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div><div className="sm:col-span-2"><label htmlFor="v-notes">Notes</label><textarea id="v-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div></div><div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save vendor" : "Add vendor"}</button></div></form></div></div>}
  </div>;
}
