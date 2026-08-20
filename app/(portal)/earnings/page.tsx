import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/status-chip";
import { db } from "@/lib/db";

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
  const context = await requirePermission("payout.view_own");
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : iso(new Date()).slice(0, 7);
  const { start, end } = monthRange(month);

  const lines = await db.payoutLedgerEntry.findMany({
    where: { userId: context.user.id, workDate: { gte: start, lte: end } },
    include: { project: { include: { client: true } } },
    orderBy: { workDate: "desc" },
  });

  const category = (line: (typeof lines)[number]) => line.overrideCategory ?? line.category;
  const actual = lines.filter((line) => category(line) === "ACTUAL_PAYOUT");
  const billedToCompany = lines.filter((line) => category(line) === "BILLED_TO_COMPANY");
  const sum = (rows: typeof lines) => rows.reduce((total, line) => total + line.amount, 0);

  const previousMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const monthLabel = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">My Work</p>
      <h1 className="portal-title">My Earnings</h1>
      <p className="portal-lead">
        {monthLabel} · per-day earnings, split between what you&apos;re actually paid and what&apos;s billed to the company on your behalf.
      </p>
    </header>

    <div className="action-bar">
      <a className="button button-outline" href={`/earnings?month=${iso(previousMonth).slice(0, 7)}`}>← Previous month</a>
      <a className="button button-outline" href="/earnings">This month</a>
      <a className="button button-outline" href={`/earnings?month=${iso(nextMonth).slice(0, 7)}`}>Next month →</a>
    </div>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{formatMoney(sum(actual))}</span><p>Actual payout</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(sum(billedToCompany))}</span><p>Billed to company (not paid out)</p></article>
      <article className="portal-card"><span className="portal-stat">{lines.length}</span><p>Active billing days</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Per-day breakdown</h2>
      {lines.length === 0 ? <p className="portal-note">No approved billing days recorded for {monthLabel} yet.</p> : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Date</th><th scope="col">Project</th><th scope="col">Category</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {lines.map((line) => <tr key={line.id}>
              <th scope="row">{line.workDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</th>
              <td>{line.project.client.name} — {line.project.name}</td>
              <td>
                <StatusChip status={category(line)} />
                {line.overrideCategory && <span className="portal-muted">Reclassified{line.overrideNote ? `: ${line.overrideNote}` : ""}</span>}
              </td>
              <td>{formatMoney(line.amount, line.currency)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      <p className="portal-note">
        A backfilled day — one worked before your assignment officially began, but on or after the project&apos;s own start date —
        is billed to the client like any other day, but is not included in your actual payout unless an admin has
        specifically reclassified it above.
      </p>
    </section>
  </div>;
}
