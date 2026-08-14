import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "My Work" };

const shortDate = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Everything the signed-in person owns and still has to act on, gathered from
 * the four modules that each have their own page. Read-only on purpose: the
 * actions live on those pages, and duplicating the decision UI here would mean
 * duplicating its permission checks too.
 */
export default async function MyWorkPage() {
  const context = await requireAuth();
  const userId = context.user.id;

  const [timesheets, leave, expenses, contracts] = await Promise.all([
    can(context, "timesheet.submit")
      // A DRAFT with no entries is not outstanding work: /timesheets upserts a
      // sheet for the current week on every visit, so merely opening that page
      // creates one. Only drafts with time recorded are worth chasing.
      ? db.timesheet.findMany({
          where: {
            userId,
            OR: [
              { status: { in: ["SUBMITTED", "REJECTED"] } },
              { status: "DRAFT", entries: { some: {} } },
            ],
          },
          orderBy: { weekStart: "desc" }, take: 5,
          select: { id: true, weekStart: true, status: true },
        })
      : [],
    can(context, "leave.request")
      ? db.leaveRequest.findMany({ where: { userId, status: "PENDING" }, orderBy: { startDate: "asc" }, take: 5, include: { leaveType: { select: { label: true } } } })
      : [],
    can(context, "expense.submit")
      ? db.expense.findMany({ where: { userId, status: { in: ["DRAFT", "SUBMITTED", "REJECTED"] } }, orderBy: { spentOn: "desc" }, take: 5, select: { id: true, description: true, amount: true, currency: true, spentOn: true, status: true } })
      : [],
    can(context, "contract.view_own")
      ? db.contractLetter.findMany({ where: { subjectUserId: userId, status: { in: ["RELEASED", "PENDING_RELEASE", "CHANGES_REQUESTED"] } }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, reference: true, status: true, updatedAt: true } })
      : [],
  ]);

  const empty = timesheets.length === 0 && leave.length === 0 && expenses.length === 0 && contracts.length === 0;

  return <>
    {empty && <section className="portal-section">
      <h2 className="portal-section-title">Nothing outstanding</h2>
      <p className="portal-note">You have no open timesheets, leave requests, expense claims or contract letters. Anything that needs your attention will show up here.</p>
    </section>}

    {timesheets.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Timesheets</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Week beginning</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{timesheets.map((sheet) => <tr key={sheet.id}>
            <th scope="row"><strong>{shortDate(sheet.weekStart)}</strong></th>
            <td><StatusChip status={sheet.status} /></td>
            <td><div className="row-actions"><Link className="row-action" href="/timesheets">Open</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {leave.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Leave awaiting a decision</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Type</th><th scope="col">Dates</th><th scope="col">Days</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{leave.map((request) => <tr key={request.id}>
            <th scope="row"><strong>{request.leaveType.label}</strong></th>
            <td>{shortDate(request.startDate)} – {shortDate(request.endDate)}</td>
            <td>{request.days}</td>
            <td><StatusChip status={request.status} /></td>
            <td><div className="row-actions"><Link className="row-action" href="/leave">Open</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {expenses.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Expense claims</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Description</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{expenses.map((expense) => <tr key={expense.id}>
            <th scope="row"><strong>{expense.description}</strong></th>
            <td>{shortDate(expense.spentOn)}</td>
            <td>{formatMoney(expense.amount, expense.currency)}</td>
            <td><StatusChip status={expense.status} /></td>
            <td><div className="row-actions"><Link className="row-action" href="/expenses">Open</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {contracts.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Contract letters</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Letter</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
          <tbody>{contracts.map((letter) => <tr key={letter.id}>
            <th scope="row"><strong>{letter.reference}</strong></th>
            <td><StatusChip status={letter.status} /></td>
            <td>{shortDate(letter.updatedAt)}</td>
            <td><div className="row-actions"><Link className="row-action" href={`/contracts/${letter.id}`}>View</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
