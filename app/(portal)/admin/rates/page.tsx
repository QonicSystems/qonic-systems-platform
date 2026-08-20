import { RateManager } from "@/components/admin/rate-manager";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Rate Management" };

export default async function AdminRatesPage() {
  await requirePermission("payout.manage");

  const [assignments, deals, ledger] = await Promise.all([
    db.projectAssignment.findMany({
      include: { user: { select: { id: true, name: true } }, project: { include: { client: { select: { name: true } } } } },
      orderBy: [{ user: { name: "asc" } }, { project: { name: "asc" } }],
    }),
    db.resourceDeal.findMany(),
    db.payoutLedgerEntry.findMany({
      include: { user: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { workDate: "desc" },
      take: 100,
    }),
  ]);

  const dealFor = (userId: string, projectId: string) => deals.find((d) => d.userId === userId && d.projectId === projectId);

  return <section className="portal-section">
    <h2 className="portal-section-title">Rate Management</h2>
    <p className="portal-note">
      The hourly rate here is what the client is billed — it no longer drives anyone&apos;s payout. Actual per-day
      payout comes from the person&apos;s own employment contract (Monthly Compensation ÷ that month&apos;s working
      days), set when their contract letter is issued. The monthly deal value below is what the client is billed
      for this person on this project — see My Earnings / Deal Financials for the results.
    </p>

    <RateManager
      assignments={assignments.map((assignment) => ({
        id: assignment.id,
        userName: assignment.user.name,
        projectLabel: `${assignment.project.client.name} — ${assignment.project.name}`,
        rate: assignment.rate,
        userId: assignment.userId,
        projectId: assignment.projectId,
        deal: (() => {
          const deal = dealFor(assignment.userId, assignment.projectId);
          return deal ? { monthlyAmount: deal.monthlyAmount, effectiveFrom: deal.effectiveFrom.toISOString().slice(0, 10) } : null;
        })(),
      }))}
      ledger={ledger.map((entry) => ({
        id: entry.id,
        userName: entry.user.name,
        projectName: entry.project.name,
        workDate: entry.workDate.toISOString().slice(0, 10),
        amount: entry.amount,
        currency: entry.currency,
        category: entry.category,
        overrideCategory: entry.overrideCategory,
        overrideNote: entry.overrideNote,
      }))}
    />
  </section>;
}
