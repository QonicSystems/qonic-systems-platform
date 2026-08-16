"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRMATION = "PURGE AUDIT LOG";

/**
 * Deliberately high-friction. Purging the audit log destroys the only record of
 * who did what, so the UI makes the consequence explicit and asks for a typed
 * phrase plus the password — the same bar as the API.
 */
export function PurgeAudit({ olderThanOptions, totalEntries }: {
  olderThanOptions: ReadonlyArray<{ days: number; count: number }>;
  totalEntries: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(olderThanOptions[0]?.days ?? 30);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const affected = olderThanOptions.find((option) => option.days === days)?.count ?? 0;
  const ready = confirmation === CONFIRMATION && password.length > 0 && affected > 0;

  const purge = async () => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/audit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation, olderThanDays: days }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) {
        setOpen(false); setPassword(""); setConfirmation("");
        router.refresh();
      }
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div className="purge-panel">
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <h3 className="purge-title">Purge log permanently</h3>
    <p className="portal-note">
      Permanently deletes audit entries older than a chosen age. There is no undo and no backup —
      once gone, there is no way to reconstruct who did what. The purge itself is recorded, so the
      log can never be emptied without trace.
    </p>

    <button type="button" className="button button-danger mt-4" onClick={() => { setOpen(true); setNotice(null); }} disabled={totalEntries === 0}>
      {totalEntries === 0 ? "Nothing to purge" : "Purge log permanently…"}
    </button>

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="purge-title">
      <div className="dialog">
        <h3 id="purge-title" className="dialog-title">Permanently delete audit entries?</h3>

        <p className="form-status form-status--error" role="alert">
          This cannot be undone. {affected.toLocaleString()} of {totalEntries.toLocaleString()} entries will be destroyed.
        </p>

        <div className="contact-form mt-4">
          <label htmlFor="purge-age">Delete entries</label>
          <select id="purge-age" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {olderThanOptions.map((option) => <option key={option.days} value={option.days}>
              {option.days === 0 ? "All entries (Purge entire log)" : `Older than ${option.days} days`} — {option.count.toLocaleString()} entr{option.count === 1 ? "y" : "ies"}
            </option>)}
          </select>
          <p className="field-hint">The purge action itself will be recorded in the audit trail.</p>

          <div className="mt-5">
            <label htmlFor="purge-password">Confirm your password</label>
            <input id="purge-password" type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} />
          </div>

          <div className="mt-5">
            <label htmlFor="purge-phrase">Type <code>{CONFIRMATION}</code> to confirm</label>
            <input id="purge-phrase" value={confirmation} autoComplete="off" spellCheck={false}
              onChange={(event) => setConfirmation(event.target.value)} aria-invalid={confirmation.length > 0 && confirmation !== CONFIRMATION} />
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => { setOpen(false); setPassword(""); setConfirmation(""); }} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" onClick={purge} disabled={busy || !ready}>
            {busy ? "Purging…" : `Permanently delete ${affected.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}
