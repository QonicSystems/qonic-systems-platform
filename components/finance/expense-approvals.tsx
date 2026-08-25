"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Claim = { id: string; name: string; spentOn: string; category: string; amount: string; description: string; project: string; status: string; billable: boolean; receiptUrl: string | null };

export function ExpenseApprovals({ claims }: { claims: ReadonlyArray<Claim> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { query, setQuery, rows, isFiltered } = useFilter(claims, (claim) => [
    claim.name, claim.spentOn, claim.category, claim.description, claim.project, claim.status, claim.amount,
  ]);

  const decide = async (id: string, decision: string, reason = "") => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(`/api/expenses/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: reason }) });
      const result = await res.json() as { message?: string };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      if (res.ok) { setRejecting(null); setNote(""); router.refresh(); }
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  if (claims.length === 0) return <p className="portal-note">Nothing to review.</p>;

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search claimant, project, category…" label="Search expense approvals" />
    {rows.length === 0
      ? <EmptyState message="Nothing to review." filteredMessage="No expense claims match that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Claim</th><th scope="col">Date</th><th scope="col">Project</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.map((claim) => <tr key={claim.id}>
            <th scope="row"><strong>{claim.name}</strong><span>{claim.description} · {claim.category}{claim.billable ? " · rebillable" : ""}</span></th>
            <td>{claim.spentOn}</td>
            <td>{claim.project}</td>
            <td>{claim.amount}</td>
            <td><StatusChip status={claim.status} /></td>
            <td>
              <div className="row-actions">
                {claim.receiptUrl && <a className="row-action" href={claim.receiptUrl} target="_blank" rel="noreferrer noopener">Receipt</a>}
                {claim.status === "SUBMITTED" && <>
                  <button type="button" className="row-action" disabled={busy} onClick={() => decide(claim.id, "APPROVED")}>Approve</button>
                  <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => setRejecting(claim)}>Reject</button>
                </>}
                {claim.status === "APPROVED" && <button type="button" className="row-action" disabled={busy} onClick={() => decide(claim.id, "REIMBURSED")}>Mark reimbursed</button>}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {rejecting && <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3 className="dialog-title">Reject {rejecting.name}&apos;s claim</h3>
        <div className="contact-form mt-3">
          <label htmlFor="rej">Reason</label>
          <textarea id="rej" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => { setRejecting(null); setNote(""); }} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" disabled={busy || note.trim().length < 3} onClick={() => decide(rejecting.id, "REJECTED", note)}>Reject</button>
        </div>
      </div>
    </div>}
  </div>;
}
