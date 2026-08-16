"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";

export type CommissionItem = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  visaType: string;
  projectName: string;
  clientName: string;
  invoiceNumber: string;
  grossAmount: number; // in cents / paise
  commissionRate: number; // e.g. 15%
  commissionAmount: number; // in cents / paise
  status: "PENDING" | "APPROVED" | "PAID";
  paidOn?: string | null;
  payoutRef?: string | null;
};

export function CommissionTracker({
  initialCommissions,
  canManage,
}: {
  initialCommissions: CommissionItem[];
  canManage: boolean;
}) {
  const [commissions, setCommissions] = useState<CommissionItem[]>(initialCommissions);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "PAID">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = commissions.filter((c) => {
    if (filter === "PENDING") return c.status === "PENDING" || c.status === "APPROVED";
    if (filter === "PAID") return c.status === "PAID";
    return true;
  });

  const totalAccrued = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);
  const totalPaid = commissions.filter((c) => c.status === "PAID").reduce((sum, c) => sum + c.commissionAmount, 0);
  const totalPending = totalAccrued - totalPaid;

  const markPaid = async (item: CommissionItem) => {
    const payoutRef = window.prompt(`Enter Payout Transaction / Wire Reference for ${item.candidateName}:`, `WIRE-COMM-${Date.now().toString().slice(-6)}`);
    if (!payoutRef) return;

    setBusyId(item.id);
    try {
      // Simulate/apply payout update
      setCommissions((current) =>
        current.map((c) =>
          c.id === item.id
            ? { ...c, status: "PAID", paidOn: new Date().toISOString().split("T")[0], payoutRef }
            : c
        )
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="portal-section">
      <header className="portal-section-head mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="portal-section-title text-xl font-bold flex items-center gap-2">
            <span>⚡ Global Candidate Commission &amp; Payout Tracker</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Automated
            </span>
          </h2>
          <p className="portal-lead text-xs text-neutral-400">
            Automatically calculates and logs placement &amp; VISA utilization commissions when client invoices are paid.
          </p>
        </div>

        {/* Summary Metrics */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Total Accrued</p>
            <p className="text-sm font-bold text-amber-400">{formatMoney(totalAccrued, "USD")}</p>
          </div>
          <div className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Paid Out</p>
            <p className="text-sm font-bold text-emerald-400">{formatMoney(totalPaid, "USD")}</p>
          </div>
          <div className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Pending</p>
            <p className="text-sm font-bold text-sky-400">{formatMoney(totalPending, "USD")}</p>
          </div>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(["ALL", "PENDING", "PAID"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`text-xs px-3 py-1 rounded-md transition-colors ${
              filter === tab
                ? "bg-amber-400 text-black font-semibold"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
            onClick={() => setFilter(tab)}
          >
            {tab === "ALL" ? "All Commissions" : tab === "PENDING" ? "Pending Payouts" : "Paid Commissions"}
          </button>
        ))}
      </div>

      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead>
            <tr>
              <th scope="col">Global Resource</th>
              <th scope="col">Project &amp; Client</th>
              <th scope="col">Invoice Ref</th>
              <th scope="col">Gross Billing</th>
              <th scope="col">Commission Rate</th>
              <th scope="col">Earned Commission</th>
              <th scope="col">Status</th>
              {canManage && <th scope="col">Action</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <th scope="row">
                  <strong>{item.candidateName}</strong>
                  <span className="text-xs text-neutral-400">{item.candidateEmail}</span>
                  <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.2 bg-slate-800 text-amber-300 rounded">
                    {item.visaType}
                  </span>
                </th>
                <td>
                  <strong className="text-xs text-white">{item.projectName}</strong>
                  <span className="block text-[11px] text-neutral-400">{item.clientName}</span>
                </td>
                <td>
                  <span className="font-mono text-xs text-amber-300">{item.invoiceNumber}</span>
                </td>
                <td>{formatMoney(item.grossAmount, "USD")}</td>
                <td>
                  <span className="font-semibold text-amber-400">{item.commissionRate}%</span>
                </td>
                <td>
                  <strong className="text-emerald-400">{formatMoney(item.commissionAmount, "USD")}</strong>
                </td>
                <td>
                  {item.status === "PAID" ? (
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        ✓ PAID
                      </span>
                      {item.payoutRef && (
                        <span className="block text-[10px] text-neutral-500 font-mono mt-0.5">
                          {item.payoutRef}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                      ⏳ PENDING PAYOUT
                    </span>
                  )}
                </td>
                {canManage && (
                  <td>
                    {item.status !== "PAID" ? (
                      <button
                        type="button"
                        className="button button-outline text-xs py-1 px-2 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                        onClick={() => markPaid(item)}
                        disabled={busyId === item.id}
                      >
                        {busyId === item.id ? "Processing…" : "Mark Paid"}
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-500">Paid on {item.paidOn ?? "Record"}</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
