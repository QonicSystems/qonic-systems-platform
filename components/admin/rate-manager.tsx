"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/status-chip";

export type AssignmentRateRow = {
  id: string;
  userName: string;
  projectLabel: string;
  rate: number | null;
  userId: string;
  projectId: string;
  deal: { monthlyAmount: number; effectiveFrom: string } | null;
  /** ISO date, or null if never deliberately set — see ProjectAssignment.startedOn. */
  startedOn: string | null;
};

export type LedgerRow = {
  id: string;
  userName: string;
  projectName: string;
  workDate: string;
  amount: number;
  currency: string;
  category: string;
  overrideCategory: string | null;
  overrideNote: string | null;
};

export function RateManager({ assignments, ledger }: { assignments: AssignmentRateRow[]; ledger: LedgerRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (input: RequestInfo, init: RequestInit) => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(input, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await res.json().catch(() => ({})) as { message?: string };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      if (res.ok) router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  const saveRate = (id: string, rate: string) =>
    call(`/api/admin/rates/assignment/${id}`, { method: "PATCH", body: JSON.stringify({ rate }) });

  const saveStartedOn = (id: string, startedOn: string) =>
    call(`/api/admin/rates/assignment/${id}`, { method: "PATCH", body: JSON.stringify({ startedOn }) });

  const saveDeal = (row: AssignmentRateRow, monthlyAmount: string, effectiveFrom: string) =>
    call("/api/admin/rates/deal", {
      method: "PATCH",
      body: JSON.stringify({ userId: row.userId, projectId: row.projectId, monthlyAmount, effectiveFrom }),
    });

  const reclassify = (id: string, category: string | null) => {
    const note = category ? window.prompt("Reason for reclassifying (optional):") ?? "" : "";
    return call(`/api/admin/rates/ledger/${id}`, { method: "PATCH", body: JSON.stringify({ category, note }) });
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <h3 className="portal-section-title" style={{ fontSize: "1.05rem" }}>Assignments &amp; deals</h3>
    <p className="field-hint mb-3">Rate, deal amount, and start date save on blur. Enter money as a plain number, e.g. 500.</p>
    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr><th scope="col">Person</th><th scope="col">Project</th><th scope="col">Started on</th><th scope="col">Client hourly rate</th><th scope="col">Monthly deal</th><th scope="col">Effective from</th></tr>
        </thead>
        <tbody>
          {assignments.map((row) => <AssignmentRow key={row.id} row={row} busy={busy} onSaveRate={saveRate} onSaveDeal={saveDeal} onSaveStartedOn={saveStartedOn} />)}
          {assignments.length === 0 && <tr><td colSpan={6}>No project assignments yet.</td></tr>}
        </tbody>
      </table>
    </div>

    <h3 className="portal-section-title mt-6" style={{ fontSize: "1.05rem" }}>Recent payout entries</h3>
    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Person</th><th scope="col">Project</th><th scope="col">Amount</th><th scope="col">Category</th><th scope="col">Actions</th></tr>
        </thead>
        <tbody>
          {ledger.map((entry) => {
            const effective = entry.overrideCategory ?? entry.category;
            const other = effective === "ACTUAL_PAYOUT" ? "BILLED_TO_COMPANY" : "ACTUAL_PAYOUT";
            return <tr key={entry.id}>
              <td>{entry.workDate}</td>
              <td>{entry.userName}</td>
              <td>{entry.projectName}</td>
              <td>{formatMoney(entry.amount, entry.currency)}</td>
              <td>
                <StatusChip status={effective} />
                {entry.overrideCategory && <span className="portal-muted">Reclassified{entry.overrideNote ? `: ${entry.overrideNote}` : ""}</span>}
              </td>
              <td>
                <div className="row-actions">
                  <button type="button" className="row-action" disabled={busy} onClick={() => reclassify(entry.id, other)}>
                    Mark {other === "ACTUAL_PAYOUT" ? "actual payout" : "billed to company"}
                  </button>
                  {entry.overrideCategory && (
                    <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => reclassify(entry.id, null)}>
                      Clear override
                    </button>
                  )}
                </div>
              </td>
            </tr>;
          })}
          {ledger.length === 0 && <tr><td colSpan={6}>No approved payout entries yet.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}

function AssignmentRow({ row, busy, onSaveRate, onSaveDeal, onSaveStartedOn }: {
  row: AssignmentRateRow;
  busy: boolean;
  onSaveRate: (id: string, value: string) => void;
  onSaveDeal: (row: AssignmentRateRow, monthlyAmount: string, effectiveFrom: string) => void;
  onSaveStartedOn: (id: string, value: string) => void;
}) {
  const [rate, setRate] = useState(row.rate !== null ? (row.rate / 100).toFixed(2) : "");
  const [dealAmount, setDealAmount] = useState(row.deal ? (row.deal.monthlyAmount / 100).toFixed(2) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(row.deal?.effectiveFrom ?? "");
  const [startedOn, setStartedOn] = useState(row.startedOn ?? "");

  const saveDealIfComplete = () => {
    if (dealAmount.trim() !== "" && effectiveFrom.trim() !== "") onSaveDeal(row, dealAmount, effectiveFrom);
  };

  return <tr>
    <th scope="row">{row.userName}</th>
    <td>{row.projectLabel}</td>
    <td>
      <input
        type="date" value={startedOn} disabled={busy}
        aria-label={`Date ${row.userName} started on ${row.projectLabel}`}
        title="When this person actually began working on this project — drives actual-payout vs billed-to-company categorization. Leave blank to fall back to the assignment's creation date."
        onChange={(event) => setStartedOn(event.target.value)}
        onBlur={() => onSaveStartedOn(row.id, startedOn)}
      />
    </td>
    <td>
      <input
        className="duration-input" style={{ width: "6rem" }} value={rate} disabled={busy}
        placeholder="—" aria-label={`Client hourly rate for ${row.userName} on ${row.projectLabel}`}
        onChange={(event) => setRate(event.target.value)}
        onBlur={() => onSaveRate(row.id, rate)}
      />
    </td>
    <td>
      <input
        className="duration-input" style={{ width: "7.5rem" }} value={dealAmount} disabled={busy}
        placeholder="—" aria-label={`Monthly deal amount for ${row.userName} on ${row.projectLabel}`}
        onChange={(event) => setDealAmount(event.target.value)}
        onBlur={saveDealIfComplete}
      />
    </td>
    <td>
      <input
        type="date" value={effectiveFrom} disabled={busy}
        aria-label={`Deal effective-from date for ${row.userName} on ${row.projectLabel}`}
        onChange={(event) => setEffectiveFrom(event.target.value)}
        onBlur={saveDealIfComplete}
      />
    </td>
  </tr>;
}
