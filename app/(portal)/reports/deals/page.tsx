import { requirePermission } from "@/lib/auth/guard";
import { formatProjectDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Deal Financials" };

export default async function DealsPage() {
  await requirePermission("payout.view_all");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const [deals, ledger, assignments] = await Promise.all([
    db.resourceDeal.findMany({
      include: { user: { select: { name: true } }, project: { include: { client: true } } },
      orderBy: [{ user: { name: "asc" } }, { project: { name: "asc" } }],
    }),
    db.payoutLedgerEntry.findMany({
      where: { workDate: { gte: monthStart, lte: monthEnd } },
      select: { userId: true, projectId: true, amount: true, category: true, overrideCategory: true },
    }),
    db.projectAssignment.findMany({ select: { userId: true, projectId: true, startedOn: true } }),
  ]);
  const startedOnFor = new Map(assignments.map((a) => [`${a.userId}:${a.projectId}`, a.startedOn]));

  const totals = new Map<string, { actual: number; billedToCompany: number }>();
  for (const line of ledger) {
    const key = `${line.userId}:${line.projectId}`;
    const bucket = totals.get(key) ?? { actual: 0, billedToCompany: 0 };
    const category = line.overrideCategory ?? line.category;
    if (category === "ACTUAL_PAYOUT") bucket.actual += line.amount; else bucket.billedToCompany += line.amount;
    totals.set(key, bucket);
  }

  const dealTotal = deals.reduce((sum, deal) => sum + deal.monthlyAmount, 0);
  const actualTotal = [...totals.values()].reduce((sum, bucket) => sum + bucket.actual, 0);
  const billedToCompanyTotal = [...totals.values()].reduce((sum, bucket) => sum + bucket.billedToCompany, 0);

  return <div className="portal-page">
    <div className="hero-panel">
      <span className="hero-eyebrow">Reports</span>
      <h1 className="hero-title">Deal Financials</h1>
      <p className="hero-lead">{monthLabel} · client-billed deal value against actual resource payout and company-billed backfill.</p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(dealTotal)}</span>
          <p className="hero-stat-label">Total closed deal value</p>
        </div>
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(actualTotal)}</span>
          <p className="hero-stat-label">Actual payout, this month</p>
        </div>
        <div>
          <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(billedToCompanyTotal)}</span>
          <p className="hero-stat-label">Billed to company, this month</p>
        </div>
      </div>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">By resource</h2>
      {deals.length === 0 ? <p className="portal-note">No deal amounts on record yet — set one in Administration → Rate Management.</p> : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead>
            <tr>
              <th scope="col">Resource</th><th scope="col">Project</th><th scope="col">Started on</th><th scope="col">Deal amount / mo</th>
              <th scope="col">Actual payout</th><th scope="col">Billed to company</th><th scope="col">Effective from</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const bucket = totals.get(`${deal.userId}:${deal.projectId}`) ?? { actual: 0, billedToCompany: 0 };
              const startedOn = startedOnFor.get(`${deal.userId}:${deal.projectId}`);
              return <tr key={deal.id}>
                <th scope="row"><strong>{deal.user.name}</strong></th>
                <td>{deal.project.client.name} — {deal.project.name}</td>
                <td>{startedOn ? formatProjectDate(startedOn) : <span className="portal-muted">Not set</span>}</td>
                <td>{formatMoney(deal.monthlyAmount, deal.currency)}</td>
                <td>{formatMoney(bucket.actual)}</td>
                <td>{formatMoney(bucket.billedToCompany)}</td>
                <td>{formatProjectDate(deal.effectiveFrom)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}
