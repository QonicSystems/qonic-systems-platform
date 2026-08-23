import { can, requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { AnimatedNumber } from "@/components/portal/animated-number";
import { StatusChip } from "@/components/status-chip";
import { EarningsInvoiceActions } from "@/components/finance/earnings-invoice-actions";
import { db } from "@/lib/db";
import { monthlySalaryValues } from "@/lib/finance/compensation";
import { remainingEarningAmount } from "@/lib/finance/earnings";

export const metadata = { title: "My Earnings" };

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** "2026-08" → the first and last day of that UTC calendar month. */
function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0));
  return { start, end };
}

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  // All authenticated People accounts can raise their own calculated payable
  // invoice. Delivery-detail visibility remains separately permissioned.
  const context = await requirePermission("portal.access");
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : iso(new Date()).slice(0, 7);
  const { start, end } = monthRange(month);

  const [user, lines, profiles, invoices, earlyReleases] = await Promise.all([
    db.user.findUnique({ where: { id: context.user.id }, include: { role: true } }),
    db.payoutLedgerEntry.findMany({
      where: { userId: context.user.id, workDate: { gte: start, lte: end } },
      include: { project: { include: { client: true } } },
      orderBy: { workDate: "desc" },
    }),
    db.compensationProfile.findMany({
      where: { userId: context.user.id, effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
      orderBy: { effectiveFrom: "asc" },
    }),
    db.earningInvoice.findMany({
      where: { userId: context.user.id, period: start },
      select: { id: true, reference: true, currency: true, amount: true, sequence: true, status: true, submittedAt: true, paidAt: true },
      orderBy: { sequence: "asc" },
    }),
    db.earningInvoiceEarlyRelease.findMany({
      where: { userId: context.user.id, period: start },
      select: { currency: true, reason: true, grantedAt: true, usedAt: true, grantedBy: { select: { name: true } } },
    }),
  ]);
  const deliveryPayee = Boolean(user?.role.viaCandidatePool);

  // `category` is computed and frozen when the timesheet is approved. It used to
  // be read through an admin override set in Rate Management; that screen and its
  // override columns are gone, so the stored value is the only value.
  const actual = lines.filter((line) => line.category === "ACTUAL_PAYOUT");
  const billedToCompany = lines.filter((line) => line.category === "BILLED_TO_COMPANY");
  const sum = (rows: typeof lines) => rows.reduce((total, line) => total + line.amount, 0);

  // Billed-to-company is a company-vs-client accounting split, not something
  // that changes what an Employee is owed — only payout.view_all (Co-Founder,
  // and the CEO by super-admin default) sees it. An Employee's own page shows
  // only their actual payout, both in the stats and the per-day rows below,
  // so nothing here can leak that a backfilled/billed-to-company day even
  // happened.
  const canViewAll = deliveryPayee && can(context, "payout.view_all");
  const visibleLines = canViewAll ? lines : actual;

  const invoicesByCurrency = new Map<string, typeof invoices>();
  for (const invoice of invoices) invoicesByCurrency.set(invoice.currency, [...(invoicesByCurrency.get(invoice.currency) ?? []), invoice]);
  const earlyReleaseByCurrency = new Map(earlyReleases.map((release) => [release.currency, release]));
  const expectedCandidates = deliveryPayee
    ? [...new Map(actual.map((line) => [line.currency, 0] as const)).keys()].map((currency) => ({
        currency,
        amount: actual.filter((line) => line.currency === currency).reduce((total, line) => total + line.amount, 0),
        source: "DELIVERY_PAYOUT" as const,
      }))
    : monthlySalaryValues(profiles, month).map((value) => ({
        currency: value.currency,
        amount: value.amount,
        source: "MONTHLY_SALARY" as const,
      }));

  const previousMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const currentMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const monthIsClosed = end < currentMonthStart;
  const invoiceCandidates = expectedCandidates.map((candidate) => {
    const raised = invoicesByCurrency.get(candidate.currency) ?? [];
    const remainingAmount = remainingEarningAmount(candidate.amount, raised);
    const earlyRelease = earlyReleaseByCurrency.get(candidate.currency) ?? null;
    return {
      ...candidate,
      amount: formatMoney(remainingAmount, candidate.currency),
      canRaise: remainingAmount > 0 && (monthIsClosed || Boolean(earlyRelease && !earlyRelease.usedAt)),
      earlyRelease: earlyRelease ? {
        grantedBy: earlyRelease.grantedBy.name,
        reason: earlyRelease.reason,
        grantedAt: earlyRelease.grantedAt.toISOString(),
        usedAt: earlyRelease.usedAt?.toISOString() ?? null,
      } : null,
      invoices: raised,
    };
  });
  const monthLabel = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return <div className="portal-page">
    <div className="hero-panel">
      <span className="hero-eyebrow">My Work</span>
      <h1 className="hero-title">My Earnings</h1>
      <p className="hero-lead">
        {monthLabel} · {deliveryPayee
          ? canViewAll
            ? "per-day delivery earnings, split between payout and company-billed retained value."
            : "your approved delivery earnings and payable invoice."
          : "your salary schedule and payable invoice to Qonic Systems."}
      </p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value" style={{ fontSize: "2rem" }}>
          <AnimatedNumber value={deliveryPayee ? sum(actual) : invoiceCandidates.length} />
          </span>
          <p className="hero-stat-label">{deliveryPayee ? "Actual payout" : "Salary currencies"}</p>
        </div>
        {canViewAll && (
          <div>
            <span className="hero-stat-value" style={{ fontSize: "1.6rem" }}>{formatMoney(sum(billedToCompany))}</span>
            <p className="hero-stat-label">Billed to company (not paid out)</p>
          </div>
        )}
        <div><span className="hero-stat-value">{deliveryPayee ? visibleLines.length : invoices.length}</span><p className="hero-stat-label">{deliveryPayee ? "Active billing days" : "Invoices raised"}</p></div>
      </div>
    </div>

    <div className="action-bar">
      <a className="button button-outline" href={`/earnings?month=${iso(previousMonth).slice(0, 7)}`}>← Previous month</a>
      <a className="button button-outline" href="/earnings">This month</a>
      <a className="button button-outline" href={`/earnings?month=${iso(nextMonth).slice(0, 7)}`}>Next month →</a>
    </div>

    <EarningsInvoiceActions month={month} candidates={invoiceCandidates.map((candidate) => ({
      ...candidate,
      invoices: candidate.invoices.map((invoice) => ({
        id: invoice.id,
        reference: invoice.reference,
        sequence: invoice.sequence,
        status: invoice.status,
        submittedAt: invoice.submittedAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
    }))} />

    {deliveryPayee && <section className="portal-section">
      <h2 className="portal-section-title">Per-day breakdown</h2>
      {visibleLines.length === 0 ? <p className="portal-note">No approved billing days recorded for {monthLabel} yet.</p> : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Date</th><th scope="col">Project</th>{canViewAll && <th scope="col">Category</th>}<th scope="col">Amount</th></tr></thead>
          <tbody>
            {visibleLines.map((line) => <tr key={line.id}>
              <th scope="row">{line.workDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</th>
              <td>{line.project.client.name} — {line.project.name}</td>
              {canViewAll && <td><StatusChip status={line.category} /></td>}
              <td>{formatMoney(line.amount, line.currency)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      {canViewAll && <p className="portal-note">
        A backfilled day — one worked before your assignment officially began, but on or after the project&apos;s own start date —
        is billed to the client like any other day, but is not included in your actual payout unless an admin has
        specifically reclassified it above.
      </p>}
    </section>}
  </div>;
}
