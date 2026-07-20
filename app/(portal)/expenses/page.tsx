import { ExpenseManager } from "@/components/finance/expense-manager";
import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const context = await requirePermission("expense.submit");

  const [expenses, projects] = await Promise.all([
    db.expense.findMany({ where: { userId: context.user.id }, include: { project: { select: { name: true } } }, orderBy: { spentOn: "desc" } }),
    db.projectAssignment.findMany({ where: { userId: context.user.id }, include: { project: { select: { id: true, name: true } } } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = expenses.filter((e) => ["SUBMITTED", "APPROVED"].includes(e.status));

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">My Work</p>
      <h1 className="portal-title">Expenses</h1>
      <p className="portal-lead">{formatMoney(pending.reduce((s, e) => s + e.amount, 0))} awaiting reimbursement.</p>
    </header>

    <ExpenseManager
      expenses={expenses.map((e) => ({
        id: e.id, spentOn: e.spentOn.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        category: e.category, amount: formatMoney(e.amount, e.currency), description: e.description,
        project: e.project?.name ?? "—", status: e.status, receiptUrl: e.receiptUrl, note: e.decisionNote,
      }))}
      projects={projects.map((a) => ({ id: a.project.id, name: a.project.name }))}
      today={today}
    />
  </div>;
}
