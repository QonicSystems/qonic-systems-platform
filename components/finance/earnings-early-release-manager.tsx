"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type EarningEarlyReleaseRow = {
  userId: string;
  payee: string;
  role: string;
  month: string;
  currency: string;
  amount: string;
  source: "DELIVERY_PAYOUT" | "MONTHLY_SALARY";
  canEnable: boolean;
  release: { grantedBy: string; grantedAt: string; reason: string; usedAt: string | null } | null;
};

/** Founder-only exception queue. Each approval is one person, currency, and open month. */
export function EarningsEarlyReleaseManager({ releases }: { releases: ReadonlyArray<EarningEarlyReleaseRow> }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { query, setQuery, rows, isFiltered } = useFilter(releases, (row) => [row.payee, row.role, row.currency, row.source, row.release?.grantedBy, row.release?.reason]);

  const enable = async (row: EarningEarlyReleaseRow) => {
    if (reason.trim().length < 8) {
      setNotice({ tone: "error", text: "Please enter an urgency reason of at least 8 characters." });
      return;
    }
    const key = `${row.userId}:${row.currency}`;
    setBusyKey(key); setNotice(null);
    try {
      const response = await fetch("/api/earnings/early-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, month: row.month, currency: row.currency, reason }),
      });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Unable to enable urgent invoice access." });
      if (response.ok) {
        setReasonKey(null);
        setReason("");
        router.refresh();
      }
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusyKey(null);
    }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search person, role, currency…" label="Search urgent invoice access" />
    {rows.length === 0 ? <EmptyState message="No current-month earnings are available for urgent release." filteredMessage="No urgent invoice candidates match that search." isFiltered={isFiltered} /> : <div className="matrix-scroll"><table className="matrix matrix--people">
      <thead><tr><th scope="col">Person</th><th scope="col">Current calculated earning</th><th scope="col">Immediate access</th><th scope="col">Action</th></tr></thead>
      <tbody>{rows.map((row) => {
        const key = `${row.userId}:${row.currency}`;
        return <tr key={key}>
          <th scope="row">{row.payee}<span>{row.role}</span></th>
          <td><div className="flex flex-col items-start gap-1">
            <strong>{row.amount}</strong>
            <span className="portal-muted">{row.source === "DELIVERY_PAYOUT" ? `${row.currency} approved delivery to date` : `${row.currency} current salary schedule`}</span>
          </div></td>
          <td>{row.release
            ? <div className="flex flex-col items-start gap-1">
              <strong>{row.release.usedAt ? "Used" : "Enabled"}</strong>
              <span className="portal-muted">{row.release.grantedBy} · {new Date(row.release.grantedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="portal-muted">{row.release.reason}</span>
            </div>
            : <span className="portal-muted">Not enabled</span>}</td>
          <td>{!row.release && row.canEnable
            ? reasonKey === key
              ? <div className="flex min-w-56 flex-col items-start gap-2">
                <label className="sr-only" htmlFor={`early-release-reason-${key}`}>Urgency reason for {row.payee}</label>
                <textarea
                  id={`early-release-reason-${key}`}
                  className="input min-h-20 w-full text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Required urgency reason (at least 8 characters)"
                  maxLength={1000}
                  disabled={busyKey !== null}
                />
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="row-action row-action--highlight" disabled={busyKey !== null} onClick={() => enable(row)}>{busyKey === key ? "Enabling…" : "Confirm enable"}</button>
                  <button type="button" className="row-action" disabled={busyKey !== null} onClick={() => { setReasonKey(null); setReason(""); }}>Cancel</button>
                </div>
              </div>
              : <button type="button" className="row-action row-action--highlight" disabled={busyKey !== null} onClick={() => { setReasonKey(key); setReason(""); setNotice(null); }}>Enable urgent raise</button>
            : row.release?.usedAt
              ? <span className="portal-muted">Already raised</span>
              : <span className="portal-muted">{row.release ? "Awaiting their invoice" : "Authority required"}</span>}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </div>;
}
