"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PendingSheet = { id: string; name: string; week: string; total: string; billable: string };

export function TimesheetApprovals({ sheets }: { sheets: ReadonlyArray<PendingSheet> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<PendingSheet | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED", reason = "") => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/timesheets/${id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: reason }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) { setRejecting(null); setNote(""); router.refresh(); }
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Employee</th><th scope="col">Week</th><th scope="col">Total</th><th scope="col">Billable</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {sheets.map((sheet) => <tr key={sheet.id}>
            <th scope="row"><strong>{sheet.name}</strong></th>
            <td>{sheet.week}</td>
            <td>{sheet.total}</td>
            <td>{sheet.billable}</td>
            <td>
              <div className="row-actions">
                <button type="button" className="row-action" disabled={busy} onClick={() => decide(sheet.id, "APPROVED")}>Approve</button>
                <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => { setRejecting(sheet); setNotice(null); }}>Send back</button>
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {rejecting && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="reject-title">
      <div className="dialog">
        <h3 id="reject-title" className="dialog-title">Send back {rejecting.name}&apos;s week</h3>
        <p className="portal-note">Explain what needs to change. They will see this note when they reopen the week.</p>
        <div className="contact-form mt-4">
          <label htmlFor="reject-note">Reason</label>
          <textarea id="reject-note" rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => { setRejecting(null); setNote(""); }} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" disabled={busy || note.trim().length < 3}
            onClick={() => decide(rejecting.id, "REJECTED", note)}>Send back</button>
        </div>
      </div>
    </div>}
  </div>;
}
