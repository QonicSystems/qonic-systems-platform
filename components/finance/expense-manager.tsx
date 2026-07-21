"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["Travel", "Accommodation", "Meals", "Software", "Equipment", "Training", "Other"];
type Row = { id: string; spentOn: string; category: string; amount: string; description: string; project: string; status: string; receiptUrl: string | null; note: string | null };
type Errors = Record<string, string>;

export function ExpenseManager({ expenses, projects, today }: {
  expenses: ReadonlyArray<Row>;
  projects: ReadonlyArray<{ id: string; name: string }>;
  /** Supplied by the server — reading the clock during render is impure. */
  today: string;
}) {
  const router = useRouter();
  const empty = { amount: "", spentOn: today, category: "Travel", description: "", receiptUrl: "", projectId: "", billable: false };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>, andSubmit: boolean) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, submit: andSubmit }) });
      const result = await res.json() as { message?: string; errors?: Errors };
      if (!res.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Saved." });
      setForm(empty); setOpen(false); router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <p><button type="button" className="button button-primary" onClick={() => setOpen(true)}>Claim an expense</button></p>

    {expenses.length === 0 ? <p className="portal-note">No expense claims yet.</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Description</th><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Project</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {expenses.map((expense) => <tr key={expense.id}>
            <th scope="row"><strong>{expense.description}</strong>{expense.note && <span>“{expense.note}”</span>}</th>
            <td>{expense.spentOn}</td>
            <td>{expense.category}</td>
            <td>{expense.project}</td>
            <td>{expense.amount}</td>
            <td>
              <span className={`status-chip status-chip--${expense.status.toLowerCase()}`}>{expense.status.toLowerCase()}</span>
              {expense.receiptUrl && <a className="portal-muted" href={expense.receiptUrl} target="_blank" rel="noreferrer noopener">Receipt</a>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="exp-title">
      <div className="dialog dialog--wide">
        <h3 id="exp-title" className="dialog-title">Claim an expense</h3>
        <form className="contact-form" noValidate onSubmit={(e) => submit(e, true)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label htmlFor="e-amount">Amount <em>*</em></label><input id="e-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-invalid={Boolean(errors.amount)} />{errors.amount && <p className="form-error">{errors.amount}</p>}</div>
            <div><label htmlFor="e-date">Date <em>*</em></label><input id="e-date" type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} aria-invalid={Boolean(errors.spentOn)} />{errors.spentOn && <p className="form-error">{errors.spentOn}</p>}</div>
            <div>
              <label htmlFor="e-cat">Category</label>
              <select id="e-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="e-project">Project</label>
              <select id="e-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label htmlFor="e-desc">Description <em>*</em></label><input id="e-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-invalid={Boolean(errors.description)} />{errors.description && <p className="form-error">{errors.description}</p>}</div>
            <div className="sm:col-span-2">
              <label htmlFor="e-receipt">Receipt Link</label>
              <input id="e-receipt" type="url" value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} aria-invalid={Boolean(errors.receiptUrl)} placeholder="https://" />
              {errors.receiptUrl ? <p className="form-error">{errors.receiptUrl}</p> : <p className="field-hint">A link — nothing is uploaded or stored here.</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
                <span>Rebill this to the client</span>
              </label>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="button button-outline" disabled={busy} onClick={(e) => submit(e as never, false)}>Save draft</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Submit Claim"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
