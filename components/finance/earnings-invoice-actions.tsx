"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/status-chip";

export type EarningsInvoiceCandidate = {
  currency: string;
  amount: string;
  source: "DELIVERY_PAYOUT" | "MONTHLY_SALARY";
  canRaise: boolean;
  earlyRelease: { grantedBy: string; reason: string; grantedAt: string; usedAt: string | null } | null;
  invoices: ReadonlyArray<{ id: string; reference: string; sequence: number; status: string; submittedAt: string; paidAt: string | null }>;
};

/** The payee-facing action: amount is display-only and recalculated by the API. */
export function EarningsInvoiceActions({ month, candidates }: { month: string; candidates: ReadonlyArray<EarningsInvoiceCandidate> }) {
  const router = useRouter();
  const [busyCurrency, setBusyCurrency] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const raise = async (currency: string) => {
    setBusyCurrency(currency);
    setNotice(null);
    try {
      const response = await fetch("/api/earnings/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, currency }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Unable to raise the earnings invoice." });
      if (response.ok) router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusyCurrency(null);
    }
  };

  return <section className="portal-section">
    <h2 className="portal-section-title">Monthly payment invoice</h2>
    <p className="portal-note">The amount is calculated on the server from approved delivery payout or your CEO/Co-Founder-set salary schedule; it cannot be edited in the browser. Normally it becomes available after month close. A CEO or Co-Founder may enable one urgent current-month invoice for a specific person and currency.</p>
    {notice && <p className={`form-status form-status--${notice.tone} mt-4`} role="status">{notice.text}</p>}
    {candidates.length === 0 ? <p className="portal-muted">There is no invoiceable earning for this month yet.</p> : <div className="matrix-scroll mt-4">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Earning basis</th><th scope="col">Available to invoice</th><th scope="col">Invoices</th><th scope="col">Action</th></tr></thead>
        <tbody>{candidates.map((candidate) => <tr key={candidate.currency}>
          <th scope="row">{candidate.source === "DELIVERY_PAYOUT" ? "Approved delivery payout" : "Monthly salary schedule"}<span>{candidate.currency} · {month}</span></th>
          <td>{candidate.amount}</td>
          <td>{candidate.invoices.length > 0 ? <div className="flex flex-col items-start gap-1">{candidate.invoices.map((invoice) => <span key={invoice.id} className="flex flex-wrap items-center gap-2"><a className="text-link" target="_blank" rel="noreferrer" href={`/api/earnings/invoices/${invoice.id}/pdf`}>{invoice.reference}{invoice.sequence > 1 ? ` · Supplement ${invoice.sequence}` : ""}</a><StatusChip status={invoice.status} /></span>)}</div> : "Not raised"}</td>
          <td><div className="flex flex-col items-start gap-1.5">
            {candidate.canRaise
              ? <button type="button" className="row-action row-action--highlight" onClick={() => raise(candidate.currency)} disabled={busyCurrency !== null}>{busyCurrency === candidate.currency ? "Raising…" : "Raise invoice"}</button>
              : <span className="portal-muted">{candidate.earlyRelease?.usedAt ? "Early release used; any delivery balance follows month close" : "Available after month close"}</span>}
            {candidate.earlyRelease && <span className="portal-muted text-left">Urgent release by {candidate.earlyRelease.grantedBy}: {candidate.earlyRelease.usedAt ? "used" : "enabled"}. {candidate.earlyRelease.reason}</span>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
