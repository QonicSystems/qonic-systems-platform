"use client";

import { Fragment, useRef, useState } from "react";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { StatusChip } from "@/components/status-chip";
import { useFilter } from "@/lib/ui/filter";

export type DeliveryFinanceAssignment = {
  id: string;
  developer: string;
  clientProject: string;
  projectStart: string;
  actualStart: string;
  billableHours: string;
  clientBillable: string;
  developerPayout: string;
  retainedValue: string;
  days: Array<{
    id: string;
    workDate: string;
    billableHours: string;
    clientBillable: string;
    billingStatus: "INVOICED" | "PARTIALLY_INVOICED" | "APPROVED_UNINVOICED" | "HOURS_UNAVAILABLE";
    payoutCategory: "ACTUAL_PAYOUT" | "BILLED_TO_COMPANY";
    developerPayout: string;
    retainedValue: string;
  }>;
};

const billingLabel: Record<DeliveryFinanceAssignment["days"][number]["billingStatus"], string> = {
  INVOICED: "Invoiced",
  PARTIALLY_INVOICED: "Partially invoiced",
  APPROVED_UNINVOICED: "Approved, uninvoiced",
  HOURS_UNAVAILABLE: "Hours unavailable",
};

/**
 * Keeps the financial overview compact while retaining the immutable daily
 * ledger detail needed to audit each Developer's project assignment.
 */
export function ExpandableDeliveryFinance({ assignments }: { assignments: DeliveryFinanceAssignment[] }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { query, setQuery, rows, isFiltered } = useFilter(assignments, (assignment) => [
    assignment.developer,
    assignment.clientProject,
    assignment.projectStart,
    assignment.actualStart,
    ...assignment.days.flatMap((day) => [day.workDate, billingLabel[day.billingStatus], day.payoutCategory]),
  ]);

  function toggle(id: string) {
    const opening = !expanded.has(id);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // The expand button is the final column in a deliberately wide summary
    // table. Return that scroll surface to the first column before rendering
    // its viewport-sized detail panel, so no daily finance field is hidden.
    if (opening) requestAnimationFrame(() => tableScrollRef.current?.scrollTo({ left: 0 }));
  }

  return <>
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search developer, client, project, date, or status…" label="Search delivery finance" />
    {rows.length === 0
      ? <EmptyState message="No delivery finance has been generated." filteredMessage="No delivery finance rows match that search." isFiltered={isFiltered} />
      : <div ref={tableScrollRef} className="matrix-scroll"><table className="matrix matrix--people delivery-finance-table">
    <thead><tr><th scope="col">Developer</th><th scope="col">Client / Project</th><th scope="col">Project start</th><th scope="col">Actual start</th><th scope="col" className="num">Billable hours</th><th scope="col" className="num">Client billable value</th><th scope="col" className="num">Developer payout</th><th scope="col" className="num">Retained value</th><th scope="col"><span className="sr-only">Daily finance</span></th></tr></thead>
    <tbody>{rows.map((assignment) => {
      const isExpanded = expanded.has(assignment.id);
      const detailId = `delivery-finance-${assignment.id}`;
      return <Fragment key={assignment.id}>
        <tr className={isExpanded ? "delivery-finance-row delivery-finance-row--expanded" : "delivery-finance-row"}>
          <th scope="row"><strong>{assignment.developer}</strong><span>{assignment.days.length} approved delivery {assignment.days.length === 1 ? "day" : "days"}</span></th>
          <td>{assignment.clientProject}</td>
          <td>{assignment.projectStart}</td>
          <td>{assignment.actualStart}</td>
          <td className="num">{assignment.billableHours}</td>
          <td className="num">{assignment.clientBillable}</td>
          <td className="num">{assignment.developerPayout}</td>
          <td className="num">{assignment.retainedValue}</td>
          <td><button type="button" className="delivery-finance-expand" aria-expanded={isExpanded} aria-controls={detailId} onClick={() => toggle(assignment.id)}>{isExpanded ? "Hide days" : "View days"}<span aria-hidden="true">{isExpanded ? "−" : "+"}</span></button></td>
        </tr>
        {isExpanded ? <tr id={detailId} className="delivery-finance-detail-row">
          <td colSpan={9}>
            <div className="delivery-finance-detail">
              <div className="delivery-finance-detail__heading">
                <strong>Daily finance generated</strong>
                <span>{assignment.developer} — {assignment.clientProject}</span>
              </div>
              <dl className="delivery-finance-detail__summary">
                <div><dt>Project start</dt><dd>{assignment.projectStart}</dd></div>
                <div><dt>Developer actual start</dt><dd>{assignment.actualStart}</dd></div>
                <div><dt>Approved hours</dt><dd>{assignment.billableHours}</dd></div>
                <div><dt>Client billable value</dt><dd>{assignment.clientBillable}</dd></div>
                <div><dt>Developer payout</dt><dd>{assignment.developerPayout}</dd></div>
                <div><dt>Company retained</dt><dd>{assignment.retainedValue}</dd></div>
              </dl>
              <div className="matrix-scroll delivery-finance-detail__scroll"><table className="matrix matrix--people">
                <colgroup><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "16%" }} /><col style={{ width: "15%" }} /><col style={{ width: "17%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /></colgroup>
                <thead><tr><th scope="col">Work date</th><th scope="col" className="num">Billable hours</th><th scope="col" className="num">Client billable value</th><th scope="col">Billing status</th><th scope="col">Payout classification</th><th scope="col" className="num">Developer payout</th><th scope="col" className="num">Company retained</th></tr></thead>
                <tbody>{assignment.days.map((day) => <tr key={day.id}>
                  <th scope="row">{day.workDate}</th>
                  <td className="num">{day.billableHours}</td>
                  <td className="num">{day.clientBillable}</td>
                  <td><span className={`delivery-finance-billing delivery-finance-billing--${day.billingStatus.toLowerCase()}`}>{billingLabel[day.billingStatus]}</span></td>
                  <td><StatusChip status={day.payoutCategory} label={day.payoutCategory === "ACTUAL_PAYOUT" ? "Developer payout" : "Company retained"} /></td>
                  <td className="num">{day.developerPayout}</td>
                  <td className="num">{day.retainedValue}</td>
                </tr>)}</tbody>
              </table></div>
            </div>
          </td>
        </tr> : null}
      </Fragment>;
    })}</tbody>
  </table></div>}
  </>;
}
