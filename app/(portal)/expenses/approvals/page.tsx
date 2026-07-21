import { ExpenseApprovals } from "@/components/finance/expense-approvals";
import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Expense Claims" };

export default async function ExpenseApprovalsPage() {
  const context = await requirePermission("expense.approve");

  // Never show the approver their own claim — they cannot decide it anyway.
  const claims = await db.expense.findMany({
    where: { status: { in: ["SUBMITTED", "APPROVED"] }, NOT: { userId: context.user.id } },
    include: { user: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: { spentOn: "desc" },
  });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Finance</p>
      <h1 className="portal-title">Expense Claims</h1>
      <p className="portal-lead">{claims.length} claim{claims.length === 1 ? "" : "s"} to review. Your own claims are decided by someone else.</p>
    </header>

    <ExpenseApprovals claims={claims.map((claim) => ({
      id: claim.id, name: claim.user.name,
      spentOn: claim.spentOn.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      category: claim.category, amount: formatMoney(claim.amount, claim.currency),
      description: claim.description, project: claim.project?.name ?? "—",
      status: claim.status, billable: claim.billable, receiptUrl: claim.receiptUrl,
    }))} />
  </div>;
}
