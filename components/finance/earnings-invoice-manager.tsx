"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type EarningsInvoiceFinanceRow = {
  id: string;
  reference: string;
  payee: string;
  role: string;
  period: string;
  source: "DELIVERY_PAYOUT" | "MONTHLY_SALARY";
  amount: string;
  status: string;
  submittedAt: string;
  paymentReference: string | null;
  canDecide: boolean;
};

/** Leadership's scalable queue for invoices raised through My Earnings. */
export function EarningsInvoiceManager({ invoices }: { invoices: ReadonlyArray<EarningsInvoiceFinanceRow> }) {
  const router = useRouter();
  const [status, setStatus] = useState("OPEN");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ invoice: EarningsInvoiceFinanceRow; action: "reject" | "pay" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const byStatus = useMemo(() => status === "OPEN" ? invoices.filter((invoice) => ["SUBMITTED", "APPROVED"].includes(invoice.status)) : status === "ALL" ? invoices : invoices.filter((invoice) => invoice.status === status), [invoices, status]);
  const { query, setQuery, rows, isFiltered } = useFilter(byStatus, (invoice) => [invoice.reference, invoice.payee, invoice.role, invoice.period, invoice.source, invoice.status]);
  const count = (key: string) => key === "OPEN" ? invoices.filter((invoice) => ["SUBMITTED", "APPROVED"].includes(invoice.status)).length : key === "ALL" ? invoices.length : invoices.filter((invoice) => invoice.status === key).length;

  const action = async (invoice: EarningsInvoiceFinanceRow, actionName: "approve" | "reject" | "pay", values: { note?: string; paymentReference?: string } = {}) => {
    setBusyId(invoice.id); setNotice(null);
    try {
      const response = await fetch(`/api/earnings/invoices/${invoice.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, note: values.note ?? "", paymentReference: values.paymentReference ?? "" }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Unable to update the earnings invoice." });
      if (response.ok) {
        setPendingAction(null);
        setDecisionNote("");
        setPaymentReference("");
        router.refresh();
      }
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally { setBusyId(null); }
  };

  const beginAction = (invoice: EarningsInvoiceFinanceRow, actionName: "approve" | "reject" | "pay") => {
    if (actionName === "approve") {
      void action(invoice, actionName);
      return;
    }
    setDecisionNote("");
    setPaymentReference("");
    setPendingAction({ invoice, action: actionName });
  };

  const submitPendingAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;
    void action(pendingAction.invoice, pendingAction.action, { note: decisionNote, paymentReference });
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Earnings invoice status filter">
      {["OPEN", "SUBMITTED", "APPROVED", "PAID", "REJECTED", "ALL"].map((key) => <button key={key} type="button" onClick={() => setStatus(key)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${status === key ? "bg-[#111111] text-white border-[#111111]" : "bg-[#f8f7f3] text-[#4f4f4f] border-[#e7e4da]"}`}>
        {key === "OPEN" ? "Open" : key.charAt(0) + key.slice(1).toLowerCase()} <span className={status === key ? "bg-[#ffd700] text-[#111111] px-1.5 py-0.5 rounded-full text-[10px]" : "bg-black/10 px-1.5 py-0.5 rounded-full text-[10px]"}>{count(key)}</span>
      </button>)}
    </div>
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search payee, reference, period…" label="Search earnings invoices" />
    {rows.length === 0 ? <EmptyState message="No earnings invoices in this view." filteredMessage="No earnings invoices match that search." isFiltered={isFiltered || status !== "OPEN"} /> : <div className="matrix-scroll"><table className="matrix matrix--people">
      <thead><tr><th scope="col">Invoice / Payee</th><th scope="col">Period & basis</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
      <tbody>{rows.map((invoice) => <tr key={invoice.id}>
        <th scope="row"><a className="text-link" target="_blank" rel="noreferrer" href={`/api/earnings/invoices/${invoice.id}/pdf`}>{invoice.reference}</a><span>{invoice.payee} · {invoice.role}</span></th>
        <td>{invoice.period}<span>{invoice.source === "DELIVERY_PAYOUT" ? "Approved delivery payout" : "Monthly salary schedule"}</span></td>
        <td>{invoice.amount}</td>
        <td><StatusChip status={invoice.status} />{invoice.paymentReference && <span className="portal-muted">Ref: {invoice.paymentReference}</span>}</td>
        <td><div className="row-actions flex flex-wrap gap-1"><a className="row-action" target="_blank" rel="noreferrer" href={`/api/earnings/invoices/${invoice.id}/pdf`}>PDF</a>
          {invoice.canDecide && invoice.status === "SUBMITTED" && <><button type="button" className="row-action row-action--highlight" disabled={busyId !== null} onClick={() => beginAction(invoice, "approve")}>{busyId === invoice.id ? "Saving…" : "Approve"}</button><button type="button" className="row-action row-action--danger" disabled={busyId !== null} onClick={() => beginAction(invoice, "reject")}>Reject</button></>}
          {invoice.canDecide && invoice.status === "APPROVED" && <button type="button" className="row-action row-action--highlight" disabled={busyId !== null} onClick={() => beginAction(invoice, "pay")}>{busyId === invoice.id ? "Saving…" : "Record paid"}</button>}
        </div></td>
      </tr>)}</tbody>
    </table></div>}

    {pendingAction && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="earnings-action-title">
      <div className="dialog">
        <h3 id="earnings-action-title" className="dialog-title">{pendingAction.action === "pay" ? "Record earnings payment" : "Reject earnings invoice"}</h3>
        <p className="portal-note">{pendingAction.invoice.reference} · {pendingAction.invoice.payee} · {pendingAction.invoice.amount}</p>
        <form className="contact-form" onSubmit={submitPendingAction}>
          {pendingAction.action === "pay" ? <div>
            <label htmlFor="earnings-payment-reference">Payment reference <span className="portal-muted">(optional)</span></label>
            <input id="earnings-payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={200} placeholder="Bank reference, UTR, or transaction ID" autoFocus />
          </div> : <div>
            <label htmlFor="earnings-rejection-reason">Reason <span className="portal-muted">(recommended)</span></label>
            <textarea id="earnings-rejection-reason" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} maxLength={1000} placeholder="Explain what needs to be corrected before resubmission" autoFocus />
          </div>}
          <div className="dialog-actions">
            <button type="button" className="button button-outline" disabled={busyId !== null} onClick={() => setPendingAction(null)}>Cancel</button>
            <button type="submit" className={pendingAction.action === "reject" ? "button button-danger" : "button button-primary"} disabled={busyId !== null}>{busyId === pendingAction.invoice.id ? "Saving…" : pendingAction.action === "pay" ? "Record payment" : "Reject invoice"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
