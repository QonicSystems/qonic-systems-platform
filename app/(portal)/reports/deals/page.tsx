import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Deal Financials" };

export default async function DealsPage() {
  await requirePermission("payout.view_all");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const [deals, ledger] = await Promise.all([
    db.resourceDeal.findMany({
      include: { user: { select: { name: true } }, project: { include: { client: true } } },
      orderBy: [{ user: { name: "asc" } }, { project: { name: "asc" } }],
    }),
    db.payoutLedgerEntry.findMany({
      where: { workDate: { gte: monthStart, lte: monthEnd } },
      select: { userId: true, projectId: true, amount: true, category: true, overrideCategory: true },
    }),
  ]);

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
    <header className="portal-page-head">
      <p className="eyebrow">Reports</p>
      <h1 className="portal-title">Deal Financials</h1>
      <p className="portal-lead">{monthLabel} · client-billed deal value against actual resource payout and company-billed backfill.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{formatMoney(dealTotal)}</span><p>Total closed deal value</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(actualTotal)}</span><p>Actual payout, this month</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(billedToCompanyTotal)}</span><p>Billed to company, this month</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">By resource</h2>
      {deals.length === 0 ? <p className="portal-note">No deal amounts on record yet — set one in Administration → Rate Management.</p> : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead>
            <tr>
              <th scope="col">Resource</th><th scope="col">Project</th><th scope="col">Deal amount / mo</th>
              <th scope="col">Actual payout</th><th scope="col">Billed to company</th><th scope="col">Effective from</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const bucket = totals.get(`${deal.userId}:${deal.projectId}`) ?? { actual: 0, billedToCompany: 0 };
              return <tr key={deal.id}>
                <th scope="row"><strong>{deal.user.name}</strong></th>
                <td>{deal.project.client.name} — {deal.project.name}</td>
                <td>{formatMoney(deal.monthlyAmount, deal.currency)}</td>
                <td>{formatMoney(bucket.actual)}</td>
                <td>{formatMoney(bucket.billedToCompany)}</td>
                <td>{deal.effectiveFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}
