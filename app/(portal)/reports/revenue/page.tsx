import { BarChart } from "@/components/portal/bar-chart";
import { requirePermission } from "@/lib/auth/guard";
import { ageingBucket, formatMoney, type AgeingBucket } from "@/lib/money";
import { db } from "@/lib/db";

const BUCKET_SEVERITY: Record<AgeingBucket, 0 | 1 | 2 | 3 | 4> = { current: 0, "1-30": 1, "31-60": 2, "61-90": 3, "90+": 4 };

export const metadata = { title: "Revenue" };

const BUCKETS: AgeingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];
const BUCKET_LABELS: Record<AgeingBucket, string> = {
  current: "Not yet due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days",
};

export default async function RevenuePage() {
  await requirePermission("report.finance");

  const [invoices, placements] = await Promise.all([
    db.invoice.findMany({ include: { client: { select: { name: true } } } }),
    db.placement.findMany({ include: { recruiter: { select: { name: true } }, application: { include: { candidate: true, job: { include: { client: true } } } } }, orderBy: { startDate: "desc" } }),
  ]);

  const live = invoices.filter((i) => !["VOID", "DRAFT"].includes(i.status));
  const billed = live.reduce((sum, i) => sum + i.total, 0);
  const collected = live.reduce((sum, i) => sum + i.paidAmount, 0);
  const outstanding = billed - collected;

  // Receivables ageing, from the due date.
  const ageing = new Map<AgeingBucket, number>(BUCKETS.map((b) => [b, 0]));
  for (const invoice of live) {
    if (invoice.status === "PAID") continue;
    const bucket = ageingBucket(invoice.dueDate);
    ageing.set(bucket, (ageing.get(bucket) ?? 0) + (invoice.total - invoice.paidAmount));
  }

  // Placement fees are separate revenue from time-and-materials billing.
  const feeTotal = placements.filter((p) => !p.fellOutAt).reduce((sum, p) => sum + p.feeAmount, 0);
  const byRecruiter = new Map<string, { name: string; count: number; fees: number }>();
  for (const placement of placements) {
    if (placement.fellOutAt) continue;
    const key = placement.recruiterId ?? "unassigned";
    const bucket = byRecruiter.get(key) ?? { name: placement.recruiter?.name ?? "Unassigned", count: 0, fees: 0 };
    bucket.count += 1; bucket.fees += placement.feeAmount;
    byRecruiter.set(key, bucket);
  }

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Reports</p>
      <h1 className="portal-title">Revenue</h1>
      <p className="portal-lead">Billed work and placement fees. Draft and void invoices are excluded.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{formatMoney(billed)}</span><p>Billed</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(collected)}</span><p>Collected</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(outstanding)}</span><p>Outstanding</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(feeTotal)}</span><p>Placement fees</p></article>
    </div>

    {billed > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Collected vs. outstanding</h2>
      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-legend-swatch chart-legend-swatch--primary" />Collected</span>
        <span className="chart-legend-item"><span className="chart-legend-swatch chart-legend-swatch--context" />Outstanding</span>
      </div>
      <div
        className="chart-split-track chart-split-track--lg"
        role="img"
        aria-label={`${formatMoney(collected)} collected, ${formatMoney(outstanding)} outstanding, of ${formatMoney(billed)} billed`}
      >
        {collected > 0 && <span className="chart-split-fill chart-split-fill--primary" style={{ width: `${(collected / billed) * 100}%` }} />}
        {outstanding > 0 && <span className="chart-split-fill chart-split-fill--context" style={{ width: `${(outstanding / billed) * 100}%` }} />}
      </div>
    </section>}

    <section className="portal-section">
      <h2 className="portal-section-title">Receivables ageing</h2>
      <div className="chart-panel">
        <BarChart
          ariaLabel="Outstanding receivables by age"
          items={BUCKETS.map((bucket) => ({
            key: bucket,
            label: BUCKET_LABELS[bucket],
            value: ageing.get(bucket) ?? 0,
            formattedValue: formatMoney(ageing.get(bucket) ?? 0),
            severity: BUCKET_SEVERITY[bucket],
          }))}
        />
      </div>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Age</th><th scope="col">Outstanding</th></tr></thead>
          <tbody>
            {BUCKETS.map((bucket) => <tr key={bucket}>
              <th scope="row"><strong>{BUCKET_LABELS[bucket]}</strong></th>
              <td className={bucket === "90+" && (ageing.get(bucket) ?? 0) > 0 ? "text-over" : ""}>{formatMoney(ageing.get(bucket) ?? 0)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Placements</h2>
      {placements.length === 0 ? <p className="portal-note">No placements recorded yet.</p> : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Candidate</th><th scope="col">Client</th><th scope="col">Start</th><th scope="col">Salary</th><th scope="col">Fee</th><th scope="col">Recruiter</th></tr></thead>
          <tbody>
            {placements.map((placement) => <tr key={placement.id}>
              <th scope="row"><strong>{placement.application.candidate.name}</strong><span>{placement.application.job.title}</span></th>
              <td>{placement.application.job.client.name}</td>
              <td>{placement.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
              <td>{formatMoney(placement.salary, placement.currency)}</td>
              <td>{formatMoney(placement.feeAmount, placement.currency)} <span className="portal-muted">{placement.feePercent}%</span></td>
              <td>{placement.recruiter?.name ?? "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

    {byRecruiter.size > 0 && <section className="portal-section">
      <h2 className="portal-section-title">By recruiter</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Recruiter</th><th scope="col">Placements</th><th scope="col">Fees</th></tr></thead>
          <tbody>
            {[...byRecruiter.values()].sort((a, b) => b.fees - a.fees).map((row) => <tr key={row.name}>
              <th scope="row"><strong>{row.name}</strong></th><td>{row.count}</td><td>{formatMoney(row.fees)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </div>;
}
