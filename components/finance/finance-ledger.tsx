"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";

export type FinanceLedgerRow = {
  id: string;
  occurredOn: string;
  searchDate: string;
  direction: "INFLOW" | "OUTFLOW" | "NON_CASH";
  category: string;
  description: string;
  counterparty: string;
  currency: string;
  amount: string;
  status: string;
};

const directionLabel = {
  INFLOW: "Cash in",
  OUTFLOW: "Cash out",
  NON_CASH: "Accrual",
} as const;

/**
 * A deliberately compact client table. It makes the event trail usable when
 * a company has years of invoices and payouts, while the ledger data and all
 * finance calculations stay on the server.
 */
export function FinanceLedger({ rows }: { rows: ReadonlyArray<FinanceLedgerRow> }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"ALL" | FinanceLedgerRow["direction"]>("ALL");
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase();
    return rows.filter((row) => (direction === "ALL" || row.direction === direction) && (
      !terms || [row.occurredOn, row.category, row.description, row.counterparty, row.currency, row.status]
        .some((value) => value.toLocaleLowerCase().includes(terms))
    ));
  }, [direction, query, rows]);
  const visible = expanded ? filtered : filtered.slice(0, 12);

  return <div className="finance-ledger">
    <div className="finance-ledger__tools">
      <TableToolbar search={query} onSearch={setQuery} placeholder="Search event, person, client, project…" label="Search finance ledger" />
      <label className="finance-ledger__filter">
        <span>Movement</span>
        <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
          <option value="ALL">All movements</option>
          <option value="INFLOW">Cash in</option>
          <option value="OUTFLOW">Cash out</option>
          <option value="NON_CASH">Accruals</option>
        </select>
      </label>
    </div>
    {visible.length === 0
      ? <EmptyState message="No finance events are recorded for this view." filteredMessage="No finance events match those filters." isFiltered={query.length > 0 || direction !== "ALL"} />
      : <div className="matrix-scroll"><table className="matrix matrix--people finance-ledger__table">
        <thead><tr><th scope="col">Date</th><th scope="col">Movement</th><th scope="col">Event</th><th scope="col">Counterparty</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id}>
          <td>{row.occurredOn}</td>
          <td><span className={`finance-ledger__direction finance-ledger__direction--${row.direction.toLocaleLowerCase()}`}>{directionLabel[row.direction]}</span></td>
          <th scope="row"><strong>{row.category}</strong><span>{row.description}</span></th>
          <td>{row.counterparty}</td>
          <td className={row.direction === "OUTFLOW" ? "finance-ledger__outflow" : ""}>{row.direction === "OUTFLOW" ? "−" : row.direction === "INFLOW" ? "+" : ""}{row.amount}</td>
          <td>{row.status}</td>
        </tr>)}</tbody>
      </table></div>}
    {filtered.length > 12 && <button type="button" className="button button-outline finance-ledger__more" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer events" : `Show all ${filtered.length} events`}</button>}
  </div>;
}
