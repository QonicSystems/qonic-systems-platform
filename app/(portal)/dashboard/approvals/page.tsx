import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Approvals" };

const shortDate = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A count of what is waiting on this person, across the three modules that have
 * an approval step. Deliberately a summary with links rather than inline
 * decision buttons: approving is guarded by rules that live in
 * lib/delivery/timesheet.ts and lib/leave/leave.ts (you cannot decide your own,
 * and leave.approve only covers your own reports), and re-implementing those
 * here is exactly how the two copies drift apart.
 */
export default async function ApprovalsPage() {
  const context = await requireAuth();
  const userId = context.user.id;

  const [timesheets, expenses, leave] = await Promise.all([
    can(context, "timesheet.approve")
      ? db.timesheet.findMany({ where: { status: "SUBMITTED", NOT: { userId } }, orderBy: { weekStart: "asc" }, take: 8, include: { user: { select: { name: true } } } })
      : [],
    can(context, "expense.approve")
      ? db.expense.findMany({ where: { status: "SUBMITTED", NOT: { userId } }, orderBy: { spentOn: "asc" }, take: 8, include: { user: { select: { name: true } } } })
      : [],
    can(context, "leave.manage") || can(context, "leave.approve")
      ? db.leaveRequest.findMany({ where: { status: "PENDING", NOT: { userId } }, orderBy: { startDate: "asc" }, take: 8, include: { user: { select: { name: true } }, leaveType: { select: { label: true } } } })
      : [],
  ]);

  const total = timesheets.length + expenses.length + leave.length;

  return <>
    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{timesheets.length}</span><p>Timesheets to review</p></article>
      <article className="portal-card"><span className="portal-stat">{expenses.length}</span><p>Expense claims to review</p></article>
      <article className="portal-card"><span className="portal-stat">{leave.length}</span><p>Leave requests to review</p></article>
    </div>

    {total === 0 && <section className="portal-section">
      <h2 className="portal-section-title">All clear</h2>
      <p className="portal-note">Nothing is waiting on you right now. Your own submissions are always decided by somebody else, so they will not appear here.</p>
    </section>}

    {timesheets.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Timesheets</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Week beginning</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{timesheets.map((sheet) => <tr key={sheet.id}>
            <th scope="row"><strong>{sheet.user.name}</strong></th>
            <td>{shortDate(sheet.weekStart)}</td>
            <td><StatusChip status={sheet.status} /></td>
            <td><div className="row-actions"><Link className="row-action row-action--primary" href="/timesheets">Review</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {expenses.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Expense claims</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{expenses.map((expense) => <tr key={expense.id}>
            <th scope="row"><strong>{expense.user.name}</strong></th>
            <td>{expense.description}</td>
            <td>{formatMoney(expense.amount, expense.currency)}</td>
            <td><StatusChip status={expense.status} /></td>
            <td><div className="row-actions"><Link className="row-action row-action--primary" href="/expenses/approvals">Review</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {leave.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Leave requests</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Person</th><th scope="col">Type</th><th scope="col">Dates</th><th scope="col">Days</th><th scope="col">Actions</th></tr></thead>
          <tbody>{leave.map((request) => <tr key={request.id}>
            <th scope="row"><strong>{request.user.name}</strong></th>
            <td>{request.leaveType.label}</td>
            <td>{shortDate(request.startDate)} – {shortDate(request.endDate)}</td>
            <td>{request.days}</td>
            <td><div className="row-actions"><Link className="row-action row-action--primary" href="/leave">Review</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
