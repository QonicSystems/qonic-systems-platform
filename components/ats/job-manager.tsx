"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = { id: string; reference: string; title: string; client: string; status: string; openings: number; applications: number; published: boolean; days: number; overSla: boolean; band: string };
type Errors = Record<string, string>;

const STATUSES = ["DRAFT", "OPEN", "ON_HOLD", "FILLED", "CLOSED"];

export function JobManager({ jobs, clients, canManage }: {
  jobs: ReadonlyArray<Row>;
  clients: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { title: "", clientId: clients[0]?.id ?? "", status: "OPEN", openings: "1", location: "", employmentType: "Full-time", salaryMin: "", salaryMax: "", currency: "INR", feePercent: "", slaDays: "30", description: "", isPublished: false };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (url: string, init: RequestInit) => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await res.json() as { message?: string; errors?: Errors };
      if (!res.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return null; }
      setNotice({ tone: "success", text: result.message ?? "Done." });
      router.refresh();
      return result;
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); return null; }
    finally { setBusy(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrors({});
    const result = await call("/api/jobs", { method: "POST", body: JSON.stringify({ ...form, openings: Number(form.openings) }) });
    if (result) { setForm(empty); setOpen(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {canManage && <p><button type="button" className="button button-primary" onClick={() => setOpen(true)} disabled={clients.length === 0}>Raise a job</button>
      {clients.length === 0 && <span className="field-hint"> Add a client first.</span>}</p>}

    {jobs.length === 0 ? <p className="portal-note">No jobs yet.</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Job</th><th scope="col">Client</th><th scope="col">Band</th><th scope="col">Pipeline</th><th scope="col">Open</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead>
        <tbody>
          {jobs.map((job) => <tr key={job.id}>
            <th scope="row">
              <Link className="text-link" href={`/jobs/${job.id}`}>{job.title}</Link>
              <span>{job.reference} · {job.openings} opening{job.openings === 1 ? "" : "s"}</span>
            </th>
            <td>{job.client}</td>
            <td>{job.band}</td>
            <td>{job.applications}</td>
            <td>{job.days}d {job.overSla && <strong className="text-over">SLA</strong>}</td>
            <td>
              <span className={`status-chip status-chip--${job.status.toLowerCase().replace(/_/g, "-")}`}>{job.status.toLowerCase().replace(/_/g, " ")}</span>
              {job.published && <span className="portal-muted">Published</span>}
            </td>
            {canManage && <td>
              <div className="row-actions">
                <select className="row-select" value={job.status} disabled={busy}
                  onChange={(e) => call("/api/jobs", { method: "PATCH", body: JSON.stringify({ id: job.id, status: e.target.value }) })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</option>)}
                </select>
                <button type="button" className="row-action" disabled={busy}
                  onClick={() => call("/api/jobs", { method: "PATCH", body: JSON.stringify({ id: job.id, isPublished: !job.published }) })}>
                  {job.published ? "Unpublish" : "Publish"}
                </button>
              </div>
            </td>}
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="job-title">
      <div className="dialog dialog--wide">
        <h3 id="job-title" className="dialog-title">Raise a job</h3>
        <form className="contact-form" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="j-client">Client <em>*</em></label>
              <select id="j-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.clientId && <p className="form-error">{errors.clientId}</p>}
            </div>
            <div>
              <label htmlFor="j-title">Job Title <em>*</em></label>
              <input id="j-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={Boolean(errors.title)} />
              {errors.title && <p className="form-error">{errors.title}</p>}
            </div>
            <div>
              <label htmlFor="j-openings">Openings</label>
              <input id="j-openings" inputMode="numeric" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} aria-invalid={Boolean(errors.openings)} />
              {errors.openings && <p className="form-error">{errors.openings}</p>}
            </div>
            <div>
              <label htmlFor="j-location">Location</label>
              <input id="j-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label htmlFor="j-min">Salary From</label>
              <input id="j-min" inputMode="decimal" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} aria-invalid={Boolean(errors.salaryMin)} />
              {errors.salaryMin && <p className="form-error">{errors.salaryMin}</p>}
            </div>
            <div>
              <label htmlFor="j-max">Salary To</label>
              <input id="j-max" inputMode="decimal" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} aria-invalid={Boolean(errors.salaryMax)} />
              {errors.salaryMax && <p className="form-error">{errors.salaryMax}</p>}
            </div>
            <div>
              <label htmlFor="j-fee">Placement Fee %</label>
              <input id="j-fee" inputMode="decimal" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: e.target.value })} aria-invalid={Boolean(errors.feePercent)} placeholder="12.5" />
              {errors.feePercent && <p className="form-error">{errors.feePercent}</p>}
            </div>
            <div>
              <label htmlFor="j-sla">Time-to-fill SLA (days)</label>
              <input id="j-sla" inputMode="numeric" value={form.slaDays} onChange={(e) => setForm({ ...form, slaDays: e.target.value })} aria-invalid={Boolean(errors.slaDays)} />
              {errors.slaDays && <p className="form-error">{errors.slaDays}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="j-desc">Description</label>
              <textarea id="j-desc" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown on the public careers page when published." />
            </div>
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked, status: e.target.checked ? "OPEN" : form.status })} />
                <span>Publish to the public careers page</span>
              </label>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Raise Job"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
