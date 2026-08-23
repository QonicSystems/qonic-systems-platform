import { StatusChip } from "@/components/status-chip";
import { ExpandableDeliveryFinance, type DeliveryFinanceAssignment } from "@/components/finance/expandable-delivery-finance";
import { PrestartBackfillFlags, type PrestartBackfillFlag } from "@/components/finance/prestart-backfill-flags";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { weekStartOf } from "@/lib/delivery/timesheet";
import { isoDay, missingPreStartWorkdays } from "@/lib/finance/prestart-backfill";
import { ageingBucket, formatMoney, hoursToCentihours, lineAmount, type AgeingBucket } from "@/lib/money";
import { currencyKeys, formatCurrencyTotals, subtractCurrencyTotals, totalsByCurrency, type CurrencyTotals } from "@/lib/finance/summary";
import { db } from "@/lib/db";

export const metadata = { title: "Company Finance" };

const BUCKETS: AgeingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];
const BUCKET_LABELS: Record<AgeingBucket, string> = {
  current: "Not yet due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days",
};
const date = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const amountAt = (totals: CurrencyTotals, currency: string) => totals[currency] ?? 0;
const dayKey = (userId: string, projectId: string, workDate: Date) => `${userId}:${projectId}:${workDate.toISOString().slice(0, 10)}`;
const assignmentKey = (userId: string, projectId: string) => `${userId}:${projectId}`;
const userWeekKey = (userId: string, weekStart: Date) => `${userId}:${isoDay(weekStart)}`;
const formatHours = (minutes: number) => `${(minutes / 60).toLocaleString("en-IN", { maximumFractionDigits: 2 })} h`;

export default async function RevenuePage() {
  const context = await requirePermission("report.finance");
  const isExecutive = context.role.key === ROLE.CEO || context.role.key === ROLE.CO_FOUNDER;

  const [invoices, expenses, payouts, placements, prestartAssignments] = await Promise.all([
    db.invoice.findMany({
      include: { client: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
    }),
    db.expense.findMany({
      where: { status: { in: ["APPROVED", "REIMBURSED"] } },
      include: { project: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { spentOn: "desc" },
    }),
    db.payoutLedgerEntry.findMany({
      include: {
        user: { select: { id: true, name: true } },
        project: {
          select: {
            id: true, name: true, startDate: true, defaultRate: true,
            client: { select: { name: true, employmentType: true, actualClientRate: true, rateCurrency: true } },
          },
        },
      },
      orderBy: { workDate: "desc" },
    }),
    db.placement.findMany({
      where: { fellOutAt: null },
      include: { recruiter: { select: { name: true } }, application: { include: { candidate: true, job: { include: { client: true } } } } },
    orderBy: { startDate: "desc" },
  }),
    isExecutive ? db.projectAssignment.findMany({
      where: { user: { role: { key: ROLE.DEVELOPER } }, project: { status: { in: ["PLANNED", "ACTIVE"] }, startDate: { not: null } } },
      select: {
        userId: true, startedOn: true, createdAt: true,
        user: { select: { name: true } },
        project: { select: { id: true, name: true, startDate: true, client: { select: { name: true } } } },
      },
    }) : Promise.resolve([]),
  ]);

  const payoutUserIds = [...new Set(payouts.map((entry) => entry.userId))];
  const payoutProjectIds = [...new Set(payouts.map((entry) => entry.projectId))];
  // The ledger decides what is payable; approved time is read alongside it to
  // reveal the hours, client billable value, and invoice state for that same
  // Developer–Project–day. The user/project filters keep this bounded to
  // delivery that already appears in the finance ledger.
  const [assignmentRows, approvedBillableEntries] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: { in: payoutUserIds }, projectId: { in: payoutProjectIds } },
      select: { userId: true, projectId: true, rate: true, startedOn: true, createdAt: true },
    }),
    db.timeEntry.findMany({
      where: { projectId: { in: payoutProjectIds }, billable: true, timesheet: { status: "APPROVED", userId: { in: payoutUserIds } } },
      select: { projectId: true, workDate: true, minutes: true, invoiceId: true, timesheet: { select: { userId: true } } },
    }),
  ]);

  const prestartUserIds = [...new Set(prestartAssignments.map((assignment) => assignment.userId))];
  const prestartProjectIds = [...new Set(prestartAssignments.map((assignment) => assignment.project.id))];
  const [prestartTimeEntries, prestartSheets] = await Promise.all([
    db.timeEntry.findMany({
      where: { projectId: { in: prestartProjectIds }, timesheet: { userId: { in: prestartUserIds } } },
      select: { projectId: true, workDate: true, timesheet: { select: { userId: true } } },
    }),
    db.timesheet.findMany({
      where: { userId: { in: prestartUserIds } },
      select: { userId: true, weekStart: true, status: true, entries: { select: { invoiceId: true } } },
    }),
  ]);

  // Company revenue comes only from a live standard invoice or Qonic's own
  // C2C claim. Vendor-to-candidate records document money held outside Qonic.
  const revenueInvoices = invoices.filter((invoice) =>
    !["VOID", "DRAFT"].includes(invoice.status) && ["STANDARD", "QONIC_TO_VENDOR"].includes(invoice.commercialKind)
  );
  const billed = totalsByCurrency(revenueInvoices.map((invoice) => ({ currency: invoice.currency, amount: invoice.total })));
  const received = totalsByCurrency(revenueInvoices.map((invoice) => ({ currency: invoice.currency, amount: invoice.paidAmount })));
  const outstanding = totalsByCurrency(revenueInvoices.map((invoice) => ({ currency: invoice.currency, amount: invoice.total - invoice.paidAmount })));

  const approvedExpenses = totalsByCurrency(expenses.map((expense) => ({ currency: expense.currency, amount: expense.amount })));
  const reimbursedExpenses = totalsByCurrency(expenses.filter((expense) => expense.status === "REIMBURSED").map((expense) => ({ currency: expense.currency, amount: expense.amount })));
  const awaitingExpensePayment = totalsByCurrency(expenses.filter((expense) => expense.status === "APPROVED").map((expense) => ({ currency: expense.currency, amount: expense.amount })));

  const actualPayouts = payouts.filter((entry) => entry.category === "ACTUAL_PAYOUT");
  const companyRetained = payouts.filter((entry) => entry.category === "BILLED_TO_COMPANY");
  const actualPayoutTotal = totalsByCurrency(actualPayouts.map((entry) => ({ currency: entry.currency, amount: entry.amount })));
  const companyRetainedTotal = totalsByCurrency(companyRetained.map((entry) => ({ currency: entry.currency, amount: entry.amount })));
  const cashAfterReimbursements = subtractCurrencyTotals(received, reimbursedExpenses);

  // This dashboard deliberately does not add retained payout value to client
  // revenue: it is a cost that was not paid to the Developer, not new cash.
  // Keeping the columns separate prevents pre-start work from being counted
  // twice when its approved hours are invoiced.
  const financeCurrencies = currencyKeys(
    billed, received, outstanding, approvedExpenses, reimbursedExpenses,
    awaitingExpensePayment, actualPayoutTotal, companyRetainedTotal
  );

  const ageing = new Map<AgeingBucket, CurrencyTotals>(BUCKETS.map((bucket) => [bucket, {}]));
  for (const invoice of revenueInvoices) {
    if (["PAID", "VOID"].includes(invoice.status)) continue;
    const bucket = ageingBucket(invoice.dueDate);
    ageing.set(bucket, totalsByCurrency([
      ...Object.entries(ageing.get(bucket) ?? {}).map(([currency, amount]) => ({ currency, amount })),
      { currency: invoice.currency, amount: invoice.total - invoice.paidAmount },
    ]));
  }

  const openInvoices = revenueInvoices.filter((invoice) => invoice.total > invoice.paidAmount);
  const c2cInvoices = revenueInvoices.filter((invoice) => invoice.commercialKind === "QONIC_TO_VENDOR" && invoice.commercialGroupId);
  const placementFees = totalsByCurrency(placements.map((placement) => ({ currency: placement.currency, amount: placement.feeAmount })));

  // These are the only gaps relevant to retained delivery value: weekday dates
  // after a project began but before this Developer actually began, with no
  // recorded time. An invoiced week stays flagged but cannot be reopened from
  // this screen, because changing it would rewrite already-billed delivery.
  const prestartRecordedDays = new Map<string, Set<string>>();
  for (const entry of prestartTimeEntries) {
    const key = assignmentKey(entry.timesheet.userId, entry.projectId);
    const days = prestartRecordedDays.get(key) ?? new Set<string>();
    days.add(isoDay(entry.workDate));
    prestartRecordedDays.set(key, days);
  }
  const prestartSheetByWeek = new Map(prestartSheets.map((sheet) => [userWeekKey(sheet.userId, sheet.weekStart), sheet]));
  const prestartBackfillFlags: PrestartBackfillFlag[] = prestartAssignments.flatMap((assignment) => {
    const missingDays = missingPreStartWorkdays({
      projectStart: assignment.project.startDate,
      actualStart: assignment.startedOn ?? assignment.createdAt,
      today: new Date(),
      recordedDays: prestartRecordedDays.get(assignmentKey(assignment.userId, assignment.project.id)) ?? new Set(),
    });
    if (missingDays.length === 0) return [];
    const reopenable = !missingDays.some((day) => {
      const sheet = prestartSheetByWeek.get(userWeekKey(assignment.userId, weekStartOf(day)));
      return sheet?.status === "APPROVED" && sheet.entries.some((entry) => entry.invoiceId !== null);
    });
    return [{
      projectId: assignment.project.id,
      userId: assignment.userId,
      developer: assignment.user.name,
      clientProject: `${assignment.project.client.name} — ${assignment.project.name}`,
      projectStart: assignment.project.startDate ? date(assignment.project.startDate) : "Not recorded",
      actualStart: date(assignment.startedOn ?? assignment.createdAt),
      unfiledDays: missingDays.map(date),
      reopenable,
    }];
  });

  const assignmentsByResourceProject = new Map(assignmentRows.map((assignment) => [assignmentKey(assignment.userId, assignment.projectId), assignment]));
  const approvedTimeByDay = new Map<string, { minutes: number; invoicedMinutes: number }>();
  for (const entry of approvedBillableEntries) {
    const key = dayKey(entry.timesheet.userId, entry.projectId, entry.workDate);
    const current = approvedTimeByDay.get(key) ?? { minutes: 0, invoicedMinutes: 0 };
    current.minutes += entry.minutes;
    if (entry.invoiceId) current.invoicedMinutes += entry.minutes;
    approvedTimeByDay.set(key, current);
  }

  type DeliveryFinanceGroup = {
    id: string;
    developer: string;
    clientProject: string;
    projectStart: string;
    actualStart: string;
    billableMinutes: number;
    clientBillableTotal: number;
    clientCurrency: string;
    missingClientRate: boolean;
    actualPayouts: Array<{ currency: string; amount: number }>;
    retainedValues: Array<{ currency: string; amount: number }>;
    days: DeliveryFinanceAssignment["days"];
  };
  const deliveryFinanceByAssignment = new Map<string, DeliveryFinanceGroup>();

  for (const payout of payouts) {
    const groupId = assignmentKey(payout.userId, payout.projectId);
    const assignment = assignmentsByResourceProject.get(groupId);
    const day = approvedTimeByDay.get(dayKey(payout.userId, payout.projectId, payout.workDate));
    const clientRate = payout.project.client.employmentType === "C2C"
      ? payout.project.client.actualClientRate
      : assignment?.rate ?? payout.project.defaultRate;
    const clientBillable = day && clientRate !== null && clientRate !== undefined
      ? lineAmount(hoursToCentihours(day.minutes), clientRate)
      : null;
    const billingStatus = !day
      ? "HOURS_UNAVAILABLE" as const
      : day.invoicedMinutes === 0
        ? "APPROVED_UNINVOICED" as const
        : day.invoicedMinutes === day.minutes
          ? "INVOICED" as const
          : "PARTIALLY_INVOICED" as const;
    const group = deliveryFinanceByAssignment.get(groupId) ?? {
      id: groupId,
      developer: payout.user.name,
      clientProject: `${payout.project.client.name} — ${payout.project.name}`,
      projectStart: payout.project.startDate ? date(payout.project.startDate) : "Not recorded",
      actualStart: assignment ? date(assignment.startedOn ?? assignment.createdAt) : "Not recorded",
      billableMinutes: 0,
      clientBillableTotal: 0,
      clientCurrency: payout.project.client.rateCurrency,
      missingClientRate: false,
      actualPayouts: [],
      retainedValues: [],
      days: [],
    } satisfies DeliveryFinanceGroup;

    if (day) group.billableMinutes += day.minutes;
    if (clientBillable === null) group.missingClientRate = true;
    else group.clientBillableTotal += clientBillable;
    if (payout.category === "ACTUAL_PAYOUT") group.actualPayouts.push({ currency: payout.currency, amount: payout.amount });
    else group.retainedValues.push({ currency: payout.currency, amount: payout.amount });
    group.days.push({
      id: payout.id,
      workDate: date(payout.workDate),
      billableHours: day ? formatHours(day.minutes) : "—",
      clientBillable: clientBillable === null ? "Rate required" : formatMoney(clientBillable, payout.project.client.rateCurrency),
      billingStatus,
      payoutCategory: payout.category,
      developerPayout: payout.category === "ACTUAL_PAYOUT" ? formatMoney(payout.amount, payout.currency) : "—",
      retainedValue: payout.category === "BILLED_TO_COMPANY" ? formatMoney(payout.amount, payout.currency) : "—",
    });
    deliveryFinanceByAssignment.set(groupId, group);
  }

  const deliveryFinanceAssignments: DeliveryFinanceAssignment[] = [...deliveryFinanceByAssignment.values()]
    .map((group) => ({
      id: group.id,
      developer: group.developer,
      clientProject: group.clientProject,
      projectStart: group.projectStart,
      actualStart: group.actualStart,
      billableHours: formatHours(group.billableMinutes),
      clientBillable: group.missingClientRate ? "Rate required" : formatMoney(group.clientBillableTotal, group.clientCurrency),
      developerPayout: formatCurrencyTotals(totalsByCurrency(group.actualPayouts)),
      retainedValue: formatCurrencyTotals(totalsByCurrency(group.retainedValues)),
      days: group.days,
    }))
    .sort((left, right) => left.developer.localeCompare(right.developer) || left.clientProject.localeCompare(right.clientProject));

  return <div className="portal-page company-finance">
    <header className="hero-panel">
      <span className="hero-eyebrow">Finance overview</span>
      <h1 className="hero-title">Company Finance</h1>
      <p className="hero-lead">A cash, receivables, delivery-cost, expense, C2C, and placement view. Different currencies are displayed separately; no exchange-rate conversion is assumed.</p>
      <div className="hero-stats">
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(billed)}</span><p className="hero-stat-label">Client invoices issued</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(received)}</span><p className="hero-stat-label">Client cash received</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(outstanding)}</span><p className="hero-stat-label">Receivables outstanding</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(actualPayoutTotal)}</span><p className="hero-stat-label">Developer payout accrued</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(companyRetainedTotal)}</span><p className="hero-stat-label">Pre-start value retained</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(approvedExpenses)}</span><p className="hero-stat-label">Approved expenses</p></div>
      </div>
    </header>

    <section className="portal-section">
      <h2 className="portal-section-title">Cash and commitments</h2>
      <p className="portal-note">Developer payouts are accrued from each Developer&apos;s Actual Start Date. Pre-start approved work is billed to the client but stays outside their payout. It is shown as retained delivery value, never added to revenue a second time.</p>
      {financeCurrencies.length === 0 ? <p className="portal-muted">No finance activity has been recorded yet.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Currency</th><th scope="col">Client billed</th><th scope="col">Cash received</th><th scope="col">Cash expenses reimbursed</th><th scope="col">Cash after expenses</th><th scope="col">Developer payout accrued</th><th scope="col">Approved expenses pending</th><th scope="col">Pre-start value retained*</th></tr></thead>
        <tbody>{financeCurrencies.map((currency) => <tr key={currency}>
          <th scope="row">{currency}</th>
          <td>{formatMoney(amountAt(billed, currency), currency)}</td>
          <td>{formatMoney(amountAt(received, currency), currency)}</td>
          <td>{formatMoney(amountAt(reimbursedExpenses, currency), currency)}</td>
          <td>{formatMoney(amountAt(cashAfterReimbursements, currency), currency)}</td>
          <td>{formatMoney(amountAt(actualPayoutTotal, currency), currency)}</td>
          <td>{formatMoney(amountAt(awaitingExpensePayment, currency), currency)}</td>
          <td>{formatMoney(amountAt(companyRetainedTotal, currency), currency)}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className="field-hint">*Retained delivery value is the contract-based payout amount that is not owed to a Developer for approved pre-start work. It is not an extra invoice or extra cash revenue.</p>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Receivables and collection</h2>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{openInvoices.length}</span><p>Open client invoices</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(outstanding)}</span><p>Outstanding collection</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(cashAfterReimbursements)}</span><p>Cash after reimbursed expenses</p></article>
      </div>
      {openInvoices.length === 0 ? <p className="portal-muted">No client receivables are outstanding.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice</th><th scope="col">Client / Project</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Issued</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead>
        <tbody>{openInvoices.map((invoice) => <tr key={invoice.id}>
          <th scope="row"><strong>{invoice.number}</strong><span>{invoice.commercialKind === "QONIC_TO_VENDOR" ? "C2C Qonic claim" : "Client invoice"}</span></th>
          <td>{invoice.client.name}<span>{invoice.project?.name ?? "No project"}</span></td>
          <td>{date(invoice.dueDate)}<span>{BUCKET_LABELS[ageingBucket(invoice.dueDate)]}</span></td>
          <td><StatusChip status={invoice.status} /></td>
          <td>{formatMoney(invoice.total, invoice.currency)}</td>
          <td>{formatMoney(invoice.paidAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.total - invoice.paidAmount, invoice.currency)}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Receivable age</th><th scope="col">Outstanding amount</th></tr></thead>
        <tbody>{BUCKETS.map((bucket) => <tr key={bucket}><th scope="row">{BUCKET_LABELS[bucket]}</th><td>{formatCurrencyTotals(ageing.get(bucket) ?? {})}</td></tr>)}</tbody>
      </table></div>
    </section>

    {isExecutive && prestartBackfillFlags.length > 0 && <section className="portal-section company-finance__prestart-flags">
      <h2 className="portal-section-title">Missing pre-start delivery time</h2>
      <p className="portal-note">These are the only unfiled working days that could become company-retained delivery value: they fall after the project started and before the assigned Developer&apos;s Actual Start Date. Reopen a row to create editable draft weeks and notify that Developer. No hours, invoice, revenue, or retained value is created until actual time is submitted and approved.</p>
      <PrestartBackfillFlags flags={prestartBackfillFlags} />
      <p className="field-hint">This executive flag is visible only to the CEO and Co-Founder. A week with invoiced delivery remains flagged but cannot be reopened here, because invoice history must never be silently changed.</p>
    </section>}

    <section className="portal-section">
      <h2 className="portal-section-title">Developer payout and retained delivery value</h2>
      <p className="portal-note">Expand any Developer–Project row to audit each approved day: logged billable hours, client billable value, invoice state, and the payout or retained value generated for that day. Payout begins from each Developer&apos;s Actual Start Date; pre-start work is retained delivery value and is never counted as revenue a second time.</p>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(actualPayoutTotal)}</span><p>Payable to Developers</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(companyRetainedTotal)}</span><p>Company-retained pre-start value</p></article>
        <article className="portal-card"><span className="portal-stat">{actualPayouts.length}</span><p>Payable delivery days</p></article>
      </div>
      {deliveryFinanceAssignments.length === 0 ? <p className="portal-muted">Daily finance entries appear when approved billable timesheets exist.</p> : <ExpandableDeliveryFinance assignments={deliveryFinanceAssignments} />}
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Operating expenses</h2>
      <p className="portal-note">Approved expenses are commitments; reimbursed expenses have left company cash. Both remain visible so finance can distinguish what is owed from what has been paid.</p>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(approvedExpenses)}</span><p>Approved commitments</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(reimbursedExpenses)}</span><p>Reimbursed / cash paid</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(awaitingExpensePayment)}</span><p>Awaiting reimbursement</p></article>
      </div>
      {expenses.length === 0 ? <p className="portal-muted">No approved expenses recorded.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Date</th><th scope="col">Expense</th><th scope="col">Claimed by</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Amount</th></tr></thead>
        <tbody>{expenses.map((expense) => <tr key={expense.id}>
          <td>{date(expense.spentOn)}</td>
          <th scope="row"><strong>{expense.category}</strong><span>{expense.description}</span></th>
          <td>{expense.user.name}</td><td>{expense.project?.name ?? "Company-wide"}</td>
          <td><StatusChip status={expense.status} /></td><td>{formatMoney(expense.amount, expense.currency)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">C2C reconciliation</h2>
      <p className="portal-note">Only the Qonic claim is counted as company revenue. Vendor and Global Candidate commissions are recorded for reconciliation, but remain vendor-held money.</p>
      {c2cInvoices.length === 0 ? <p className="portal-muted">No C2C commercial invoice sets have been raised.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice / Client</th><th scope="col">Gross client amount</th><th scope="col">Qonic claim</th><th scope="col">Vendor commission</th><th scope="col">Global Candidate commission</th><th scope="col">Status</th></tr></thead>
        <tbody>{c2cInvoices.map((invoice) => <tr key={invoice.id}>
          <th scope="row"><strong>{invoice.number}</strong><span>{invoice.client.name}</span></th>
          <td>{formatMoney(invoice.grossClientAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.qonicRevenueAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.vendorCommissionAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.globalCandidateCommissionAmount, invoice.currency)}</td>
          <td><StatusChip status={invoice.status} /></td>
        </tr>)}</tbody>
      </table></div>}
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Placement fee pipeline</h2>
      <p className="portal-note">Placement fees are earned-fee records. They are shown separately until invoiced and paid, so they are not mixed into client cash received above.</p>
      <div className="portal-grid"><article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(placementFees)}</span><p>Active placement fees</p></article><article className="portal-card"><span className="portal-stat">{placements.length}</span><p>Active placements</p></article></div>
      {placements.length === 0 ? <p className="portal-muted">No active placements recorded.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Candidate</th><th scope="col">Client</th><th scope="col">Start</th><th scope="col">Fee</th><th scope="col">Recruiter</th></tr></thead>
        <tbody>{placements.map((placement) => <tr key={placement.id}>
          <th scope="row"><strong>{placement.application.candidate.name}</strong><span>{placement.application.job.title}</span></th>
          <td>{placement.application.job.client.name}</td><td>{date(placement.startDate)}</td>
          <td>{formatMoney(placement.feeAmount, placement.currency)}<span>{placement.feePercent}%</span></td><td>{placement.recruiter?.name ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
