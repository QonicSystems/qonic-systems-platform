"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Errors = Partial<Record<"accountName" | "accountNumber" | "sortCode", string>>;

/**
 * Your reimbursement account.
 *
 * Stored values are never sent back to the browser — the server only ever
 * returns the last four digits and the bank name, so this form always starts
 * empty and saving replaces the record outright. That is deliberate: there is
 * no read path for an account number anywhere in the app.
 */
export function BankForm({ onFile }: {
  onFile: { lastFour: string; bankName: string; updatedAt: string } | null;
}) {
  const router = useRouter();
  const blank = { accountName: "", accountNumber: "", sortCode: "", bankName: "" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(!onFile);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (init: RequestInit) => {
    setBusy(true); setNotice(null); setErrors({});
    try {
      const res = await fetch("/api/profile/bank", { headers: { "Content-Type": "application/json" }, ...init });
      const result = await res.json().catch(() => ({})) as { message?: string; errors?: Errors };
      if (!res.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to save." });
        return false;
      }
      setNotice({ tone: "success", text: result.message ?? "Saved." });
      router.refresh();
      return true;
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return false;
    } finally { setBusy(false); }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await call({ method: "PUT", body: JSON.stringify(form) })) { setForm(blank); setEditing(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    {onFile && !editing && <div className="bank-onfile">
      <div>
        <strong>{onFile.bankName || "Account on file"}</strong>
        <span className="portal-muted">Ending ••••{onFile.lastFour} · updated {onFile.updatedAt}</span>
      </div>
      <div className="row-actions flex flex-wrap gap-1">
        <button type="button" className="row-action" onClick={() => setEditing(true)} disabled={busy}>Replace</button>
        <button
          type="button"
          className="row-action row-action--danger"
          disabled={busy}
          onClick={() => call({ method: "DELETE" })}
        >
          Remove
        </button>
      </div>
    </div>}

    {editing && <form className="contact-form" noValidate onSubmit={save}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="bk-name">Name on the account <em>*</em></label>
          <input id="bk-name" value={form.accountName} autoComplete="off"
            onChange={(e) => setForm({ ...form, accountName: e.target.value })} aria-invalid={Boolean(errors.accountName)} />
          {errors.accountName && <p className="form-error">{errors.accountName}</p>}
        </div>
        <div>
          <label htmlFor="bk-number">Account number <em>*</em></label>
          <input id="bk-number" value={form.accountNumber} inputMode="numeric" autoComplete="off"
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} aria-invalid={Boolean(errors.accountNumber)} />
          {errors.accountNumber && <p className="form-error">{errors.accountNumber}</p>}
        </div>
        <div>
          <label htmlFor="bk-sort">Sort code / IFSC <em>*</em></label>
          <input id="bk-sort" value={form.sortCode} autoComplete="off"
            onChange={(e) => setForm({ ...form, sortCode: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors.sortCode)} />
          {errors.sortCode && <p className="form-error">{errors.sortCode}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="bk-bank">Bank name</label>
          <input id="bk-bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Optional" />
        </div>
      </div>
      <p className="field-hint">
        The account name, number and sort code are encrypted before they are stored. Only the last four
        digits are ever shown again — nobody, including an administrator, can read them back.
      </p>
      <div className="dialog-actions">
        {onFile && <button type="button" className="button button-outline" onClick={() => { setEditing(false); setForm(blank); }} disabled={busy}>Cancel</button>}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? "Saving…" : onFile ? "Replace details" : "Save details"}
        </button>
      </div>
    </form>}
  </div>;
}
