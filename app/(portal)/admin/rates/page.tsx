import { RateManager } from "@/components/admin/rate-manager";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Rate Management" };

export default async function AdminRatesPage() {
  await requirePermission("payout.manage");

  // Founders aren't paid through this pipeline — payout is derived from an
  // employment contract's monthly compensation, which the CEO/Co-Founder
  // don't have one of — so a project assignment or ledger row belonging to
  // either would only ever be admin/delivery noise on a payroll screen.
  const nonLeadership = { role: { key: { notIn: [ROLE.CEO, ROLE.CO_FOUNDER] } } };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  const [assignments, deals, ledger, monthLedger] = await Promise.all([
    db.projectAssignment.findMany({
      where: { user: nonLeadership },
      include: { user: { select: { id: true, name: true } }, project: { include: { client: { select: { name: true } } } } },
      orderBy: [{ user: { name: "asc" } }, { project: { name: "asc" } }],
    }),
    db.resourceDeal.findMany(),
    db.payoutLedgerEntry.findMany({
      where: { user: nonLeadership },
      include: { user: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { workDate: "desc" },
      take: 100,
    }),
    db.payoutLedgerEntry.findMany({
      where: { user: nonLeadership, workDate: { gte: monthStart, lte: monthEnd } },
      select: { amount: true, category: true, overrideCategory: true },
    }),
  ]);

  const dealFor = (userId: string, projectId: string) => deals.find((d) => d.userId === userId && d.projectId === projectId);

  // Only summed when every deal shares one currency — adding minor units
  // across currencies would silently produce a meaningless figure.
  const dealCurrencies = new Set(deals.map((d) => d.currency));
  const totalDealValue = dealCurrencies.size <= 1 ? deals.reduce((sum, d) => sum + d.monthlyAmount, 0) : null;
  const dealCurrency = dealCurrencies.size === 1 ? [...dealCurrencies][0] : "INR";

  const effectiveCategory = (line: (typeof monthLedger)[number]) => line.overrideCategory ?? line.category;
  const monthActual = monthLedger.filter((l) => effectiveCategory(l) === "ACTUAL_PAYOUT").reduce((sum, l) => sum + l.amount, 0);
  const monthBilled = monthLedger.filter((l) => effectiveCategory(l) === "BILLED_TO_COMPANY").reduce((sum, l) => sum + l.amount, 0);

  return <section className="portal-section">
    <div className="hero-panel">
      <span className="hero-eyebrow">Administration</span>
      <h1 className="hero-title">Rate Management</h1>
      <p className="hero-lead">
        The hourly rate below is what the client is billed — it no longer drives anyone&apos;s payout. Actual per-day
        payout comes from the person&apos;s own employment contract (Monthly Compensation ÷ that month&apos;s working
        days), set when their contract letter is issued. The monthly deal value is what the client is billed for
        this person on this project — see My Earnings / Deal Financials for the results.
      </p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value">{assignments.length}</span>
          <p className="hero-stat-label">Active assignments</p>
        </div>
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{totalDealValue !== null ? formatMoney(totalDealValue, dealCurrency) : "Mixed currencies"}</span>
          <p className="hero-stat-label">Total monthly deal value</p>
        </div>
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(monthActual)}</span>
          <p className="hero-stat-label">Actual payout, this month</p>
        </div>
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(monthBilled)}</span>
          <p className="hero-stat-label">Billed to company, this month</p>
        </div>
      </div>
    </div>

    <RateManager
      assignments={assignments.map((assignment) => ({
        id: assignment.id,
        userName: assignment.user.name,
        projectLabel: `${assignment.project.client.name} — ${assignment.project.name}`,
        rate: assignment.rate,
        userId: assignment.userId,
        projectId: assignment.projectId,
        startedOn: assignment.startedOn ? assignment.startedOn.toISOString().slice(0, 10) : null,
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
