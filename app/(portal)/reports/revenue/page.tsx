import { StatusChip } from "@/components/status-chip";
import { ExpandableDeliveryFinance, type DeliveryFinanceAssignment } from "@/components/finance/expandable-delivery-finance";
import { EarningsEarlyReleaseManager, type EarningEarlyReleaseRow } from "@/components/finance/earnings-early-release-manager";
import { EarningsInvoiceManager, type EarningsInvoiceFinanceRow } from "@/components/finance/earnings-invoice-manager";
import { CompanyFinanceWorkspace, type FinanceCashFlowPoint, type FinanceMetric } from "@/components/finance/company-finance-workspace";
import { FinanceLedger, type FinanceLedgerRow } from "@/components/finance/finance-ledger";
import { PrestartBackfillFlags, type PrestartBackfillFlag } from "@/components/finance/prestart-backfill-flags";
import { can, requirePermission } from "@/lib/auth/guard";
import { canAdminister } from "@/lib/auth/authority";
import { ROLE } from "@/lib/auth/roles";
import { weekStartOf } from "@/lib/delivery/timesheet";
import { isoDay, missingPreStartWorkdays } from "@/lib/finance/prestart-backfill";
import { ageingBucket, formatMoney, hoursToCentihours, lineAmount, type AgeingBucket } from "@/lib/money";
import { currencyKeys, formatCurrencyTotals, subtractCurrencyTotals, totalsByCurrency, type CurrencyTotals } from "@/lib/finance/summary";
import { monthRange, monthlySalaryValues } from "@/lib/finance/compensation";
import { remainingEarningAmount } from "@/lib/finance/earnings";
import { formatSettlementRate, settlementAmountAtLockedRate } from "@/lib/finance/fx-settlement";
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

type FinanceRange = "30d" | "90d" | "ytd" | "all";

function selectedRange(value: string | undefined): FinanceRange {
  return value === "30d" || value === "90d" || value === "ytd" || value === "all" ? value : "all";
}

function rangeStart(range: FinanceRange, now: Date): Date | null {
  if (range === "all") return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "30d") start.setUTCDate(start.getUTCDate() - 29);
  if (range === "90d") start.setUTCDate(start.getUTCDate() - 89);
  if (range === "ytd") start.setUTCMonth(0, 1);
  return start;
}

const inRange = (value: Date, start: Date | null) => !start || value >= start;
const validCurrency = (value: string | undefined) => value && /^[A-Z]{3}$/.test(value) ? value : null;

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; currency?: string }>;
}) {
  const context = await requirePermission("report.finance");
  const isExecutive = context.role.key === ROLE.CEO || context.role.key === ROLE.CO_FOUNDER;
  const filters = await searchParams;
  const range = selectedRange(filters.range);
  const currency = validCurrency(filters.currency);
  const rangeFrom = rangeStart(range, new Date());
  const currentEarningMonth = new Date().toISOString().slice(0, 7);
  const currentEarningRange = monthRange(currentEarningMonth)!;

  const [invoices, expenses, payouts, placements, prestartAssignments, earningInvoices, currentEarningPeople, earlyEarningReleases] = await Promise.all([
    db.invoice.findMany({
      include: {
        client: { select: { name: true } }, project: { select: { id: true, name: true } }, creditNotes: { select: { amount: true } },
        payments: { select: { id: true, amount: true, settlementAmount: true, settlementCurrency: true, realizedFxGainLoss: true, paidOn: true, method: true, reference: true } },
      },
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
    db.earningInvoice.findMany({
      include: { user: { include: { role: true } } },
      orderBy: [{ period: "desc" }, { submittedAt: "desc" }],
    }),
    isExecutive ? db.user.findMany({
      where: { status: "ACTIVE" },
      include: {
        role: true,
        compensationProfiles: {
          where: {
            effectiveFrom: { lte: currentEarningRange.end },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: currentEarningRange.start } }],
          },
          orderBy: { effectiveFrom: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
    isExecutive ? db.earningInvoiceEarlyRelease.findMany({
      where: { period: currentEarningRange.start },
      include: { grantedBy: { select: { name: true } } },
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
  const creditValue = (invoice: (typeof invoices)[number]) => invoice.creditNotes.reduce((total, note) => total + note.amount, 0);
  const netInvoiceValue = (invoice: (typeof invoices)[number]) => Math.max(0, invoice.total - creditValue(invoice));
  const netOutstanding = (invoice: (typeof invoices)[number]) => Math.max(0, netInvoiceValue(invoice) - invoice.paidAmount);
  const revenueInvoices = invoices.filter((invoice) =>
    !["VOID", "DRAFT"].includes(invoice.status) && ["STANDARD", "QONIC_TO_VENDOR"].includes(invoice.commercialKind)
  );
  const billed = totalsByCurrency(revenueInvoices.map((invoice) => ({ currency: invoice.currency, amount: netInvoiceValue(invoice) })));
  // Cash is reported in the currency that actually reached Qonic's bank. The
  // USD (or other foreign-currency) amount still reduces the receivable, but
  // never pretends to be a USD cash receipt when the vendor paid INR.
  const received = totalsByCurrency(revenueInvoices.flatMap((invoice) => {
    if (invoice.payments.length > 0) return invoice.payments.map((payment) => ({
      currency: payment.settlementCurrency ?? invoice.currency,
      amount: payment.settlementAmount ?? payment.amount,
    }));
    return invoice.paidAmount > 0 ? [{ currency: invoice.currency, amount: Math.min(invoice.paidAmount, netInvoiceValue(invoice)) }] : [];
  }));
  // FX is a separate disclosure: it is already inside actual INR cash
  // received, so it must never be added to that cash figure a second time.
  const realizedFxGainLoss = totalsByCurrency(revenueInvoices.flatMap((invoice) => invoice.payments
    .filter((payment) => payment.realizedFxGainLoss !== null)
    .map((payment) => ({ currency: payment.settlementCurrency ?? invoice.currency, amount: payment.realizedFxGainLoss! }))));
  const outstanding = totalsByCurrency(revenueInvoices.map((invoice) => ({ currency: invoice.currency, amount: netOutstanding(invoice) })));

  const approvedExpenses = totalsByCurrency(expenses.map((expense) => ({ currency: expense.currency, amount: expense.amount })));
  const reimbursedExpenses = totalsByCurrency(expenses.filter((expense) => expense.status === "REIMBURSED").map((expense) => ({ currency: expense.currency, amount: expense.amount })));
  const awaitingExpensePayment = totalsByCurrency(expenses.filter((expense) => expense.status === "APPROVED").map((expense) => ({ currency: expense.currency, amount: expense.amount })));

  const actualPayouts = payouts.filter((entry) => entry.category === "ACTUAL_PAYOUT");
  const companyRetained = payouts.filter((entry) => entry.category === "BILLED_TO_COMPANY");
  const actualPayoutTotal = totalsByCurrency(actualPayouts.map((entry) => ({ currency: entry.currency, amount: entry.amount })));
  const companyRetainedTotal = totalsByCurrency(companyRetained.map((entry) => ({ currency: entry.currency, amount: entry.amount })));
  const activeEarningInvoices = earningInvoices.filter((invoice) => !["REJECTED", "VOID"].includes(invoice.status));
  // Developer pay is already accrued daily above. A submitted Developer
  // invoice is the claim document for that same cost, not another cost line.
  const developerInvoices = activeEarningInvoices.filter((invoice) => invoice.source === "DELIVERY_PAYOUT");
  const developerPaid = totalsByCurrency(developerInvoices.filter((invoice) => invoice.status === "PAID").map((invoice) => ({ currency: invoice.currency, amount: invoice.amount })));
  const salaryInvoices = activeEarningInvoices.filter((invoice) => invoice.source === "MONTHLY_SALARY");
  const salaryPayable = totalsByCurrency(salaryInvoices.map((invoice) => ({ currency: invoice.currency, amount: invoice.amount })));
  const salaryPaid = totalsByCurrency(salaryInvoices.filter((invoice) => invoice.status === "PAID").map((invoice) => ({ currency: invoice.currency, amount: invoice.amount })));
  const salaryOutstanding = totalsByCurrency(salaryInvoices.filter((invoice) => ["SUBMITTED", "APPROVED"].includes(invoice.status)).map((invoice) => ({ currency: invoice.currency, amount: invoice.amount })));
  // This is the cash reality after money has actually left the company. It is
  // deliberately separate from operating margin: a paid Developer invoice
  // settles a payout already accrued when delivery was approved, so it changes
  // cash but must never reduce revenue a second time.
  const cashAfterReleasedPayments = subtractCurrencyTotals(received, reimbursedExpenses, developerPaid, salaryPaid);
  const operatingMargin = Object.fromEntries(currencyKeys(billed, actualPayoutTotal, salaryPayable, approvedExpenses).map((currency) => [
    currency,
    amountAt(billed, currency) - amountAt(actualPayoutTotal, currency) - amountAt(salaryPayable, currency) - amountAt(approvedExpenses, currency),
  ])) as CurrencyTotals;

  // This dashboard deliberately does not add retained payout value to client
  // revenue: it is a cost that was not paid to the Developer, not new cash.
  // Keeping the columns separate prevents pre-start work from being counted
  // twice when its approved hours are invoiced.
  const financeCurrencies = currencyKeys(
    billed, received, outstanding, approvedExpenses, reimbursedExpenses,
    awaitingExpensePayment, actualPayoutTotal, companyRetainedTotal, developerPaid,
    salaryPayable, salaryPaid, salaryOutstanding, cashAfterReleasedPayments, operatingMargin, realizedFxGainLoss
  );
  const visibleCurrencies = currency ? financeCurrencies.filter((item) => item === currency) : financeCurrencies;
  const displayTotals = (totals: CurrencyTotals): CurrencyTotals => currency
    ? { [currency]: amountAt(totals, currency) }
    : totals;
  const periodLabel = range === "all" ? "All-time balances" : range === "ytd" ? "Year-to-date activity" : `Last ${range.slice(0, -1)} days of activity`;

  const ageing = new Map<AgeingBucket, CurrencyTotals>(BUCKETS.map((bucket) => [bucket, {}]));
  for (const invoice of revenueInvoices) {
    if (["PAID", "VOID"].includes(invoice.status)) continue;
    const bucket = ageingBucket(invoice.dueDate);
    ageing.set(bucket, totalsByCurrency([
      ...Object.entries(ageing.get(bucket) ?? {}).map(([currency, amount]) => ({ currency, amount })),
      { currency: invoice.currency, amount: netOutstanding(invoice) },
    ]));
  }

  const openInvoices = revenueInvoices.filter((invoice) => netOutstanding(invoice) > 0);
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

  const canDecideEarnings = isExecutive && can(context, "compensation.manage");
  const earningsInvoiceRows: EarningsInvoiceFinanceRow[] = earningInvoices.map((invoice) => ({
    id: invoice.id,
    reference: invoice.reference,
    payee: invoice.user.name,
    role: invoice.user.role.label,
    period: invoice.period.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    source: invoice.source,
    amount: formatMoney(invoice.amount, invoice.currency),
    status: invoice.status,
    submittedAt: date(invoice.submittedAt),
    paymentReference: invoice.paymentReference,
    canDecide: canDecideEarnings && invoice.userId !== context.user.id && canAdminister(context, invoice.user).ok,
  }));
  const releaseByPersonCurrency = new Map(earlyEarningReleases.map((release) => [`${release.userId}:${release.currency}`, release]));
  const earningEarlyReleaseRows: EarningEarlyReleaseRow[] = currentEarningPeople.flatMap((person) => {
    const expected = person.role.viaCandidatePool
      ? [...new Map(
        payouts
          .filter((entry) => entry.userId === person.id && entry.category === "ACTUAL_PAYOUT" && entry.workDate >= currentEarningRange.start && entry.workDate <= currentEarningRange.end)
          .map((entry) => [entry.currency, 0] as const),
      ).keys()].map((currency) => ({
        currency,
        amount: payouts
          .filter((entry) => entry.userId === person.id && entry.category === "ACTUAL_PAYOUT" && entry.currency === currency && entry.workDate >= currentEarningRange.start && entry.workDate <= currentEarningRange.end)
          .reduce((total, entry) => total + entry.amount, 0),
        source: "DELIVERY_PAYOUT" as const,
      }))
      : monthlySalaryValues(person.compensationProfiles, currentEarningMonth).map((earning) => ({
        currency: earning.currency,
        amount: earning.amount,
        source: "MONTHLY_SALARY" as const,
      }));

    return expected.flatMap((earning) => {
      const raised = earningInvoices.filter((invoice) =>
        invoice.userId === person.id && invoice.period.getTime() === currentEarningRange.start.getTime() && invoice.currency === earning.currency,
      );
      const remaining = remainingEarningAmount(earning.amount, raised);
      const release = releaseByPersonCurrency.get(`${person.id}:${earning.currency}`) ?? null;
      if (remaining <= 0 && !release) return [];
      const authority = person.id === context.user.id ? { ok: true } : canAdminister(context, person);
      return [{
        userId: person.id,
        payee: person.name,
        role: person.role.label,
        month: currentEarningMonth,
        currency: earning.currency,
        amount: formatMoney(remaining, earning.currency),
        source: earning.source,
        canEnable: canDecideEarnings && authority.ok && !release,
        release: release ? {
          grantedBy: release.grantedBy.name,
          grantedAt: release.grantedAt.toISOString(),
          reason: release.reason,
          usedAt: release.usedAt?.toISOString() ?? null,
        } : null,
      }];
    });
  });

  type CashEvent = {
    id: string;
    occurredAt: Date;
    currency: string;
    amount: number;
    direction: "INFLOW" | "OUTFLOW";
    category: string;
    description: string;
    counterparty: string;
    status: string;
  };
  const cashEvents: CashEvent[] = [
    ...revenueInvoices.flatMap((invoice) => {
      const recorded = invoice.payments.map((payment) => ({
        id: `payment:${payment.id}`,
        occurredAt: payment.paidOn,
        currency: payment.settlementCurrency ?? invoice.currency,
        amount: payment.settlementAmount ?? payment.amount,
        direction: "INFLOW" as const,
        category: "Client payment",
        description: `${invoice.number}${payment.settlementAmount !== null ? ` · ${formatMoney(payment.amount, invoice.currency)} applied` : ""}${payment.reference ? ` · ${payment.reference}` : ""}`,
        counterparty: invoice.client.name,
        status: `${payment.method}${payment.realizedFxGainLoss === null ? "" : ` · FX ${payment.realizedFxGainLoss >= 0 ? "gain" : "loss"} ${formatMoney(Math.abs(payment.realizedFxGainLoss), payment.settlementCurrency ?? invoice.currency)}`}`,
      }));
      // Earlier data may have an aggregate paid amount without individual
      // Payment records. Keep it visible rather than making historic cash
      // disappear from the command centre.
      return recorded.length > 0 || invoice.paidAmount <= 0 ? recorded : [{
        id: `legacy-payment:${invoice.id}`,
        occurredAt: invoice.sentAt ?? invoice.issueDate,
        currency: invoice.currency,
        amount: Math.min(invoice.paidAmount, netInvoiceValue(invoice)),
        direction: "INFLOW" as const,
        category: "Client payment",
        description: `${invoice.number} · legacy payment total`,
        counterparty: invoice.client.name,
        status: "Historic record",
      }];
    }),
    ...activeEarningInvoices.filter((invoice) => invoice.status === "PAID" && invoice.paidAt).map((invoice) => ({
      id: `earning-payment:${invoice.id}`,
      occurredAt: invoice.paidAt!,
      currency: invoice.currency,
      amount: invoice.amount,
      direction: "OUTFLOW" as const,
      category: invoice.source === "DELIVERY_PAYOUT" ? "Developer payment" : "People salary payment",
      description: `${invoice.reference}${invoice.paymentReference ? ` · ${invoice.paymentReference}` : ""}`,
      counterparty: invoice.user.name,
      status: "Paid",
    })),
    ...expenses.filter((expense) => expense.status === "REIMBURSED").map((expense) => ({
      id: `expense-payment:${expense.id}`,
      occurredAt: expense.reimbursedAt ?? expense.spentOn,
      currency: expense.currency,
      amount: expense.amount,
      direction: "OUTFLOW" as const,
      category: "Expense reimbursement",
      description: `${expense.category} · ${expense.description}`,
      counterparty: expense.user.name,
      status: "Reimbursed",
    })),
  ];
  const cashFlowCurrency = currency ?? [...new Set(cashEvents.map((event) => event.currency))].sort()[0] ?? financeCurrencies[0] ?? null;
  const selectedCashEvents = cashEvents.filter((event) => event.currency === cashFlowCurrency && inRange(event.occurredAt, rangeFrom));
  const cashFlowByMonth = new Map<string, { date: Date; inflow: number; outflow: number }>();
  for (const event of selectedCashEvents) {
    const key = `${event.occurredAt.getUTCFullYear()}-${String(event.occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const group = cashFlowByMonth.get(key) ?? { date: new Date(Date.UTC(event.occurredAt.getUTCFullYear(), event.occurredAt.getUTCMonth(), 1)), inflow: 0, outflow: 0 };
    if (event.direction === "INFLOW") group.inflow += event.amount;
    else group.outflow += event.amount;
    cashFlowByMonth.set(key, group);
  }
  const cashFlow: FinanceCashFlowPoint[] = [...cashFlowByMonth.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-6)
    .map((group) => ({
      label: group.date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      inflow: group.inflow,
      outflow: group.outflow,
      net: group.inflow - group.outflow,
    }));
  const ledgerRows: FinanceLedgerRow[] = [
    ...cashEvents.map((event) => ({
      id: event.id,
      occurredOn: date(event.occurredAt),
      searchDate: event.occurredAt.toISOString(),
      direction: event.direction,
      category: event.category,
      description: event.description,
      counterparty: event.counterparty,
      currency: event.currency,
      amount: formatMoney(event.amount, event.currency),
      status: event.status,
      sortDate: event.occurredAt,
    })),
    ...revenueInvoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      occurredOn: date(invoice.issueDate),
      searchDate: invoice.issueDate.toISOString(),
      direction: "NON_CASH" as const,
      category: "Client invoice issued",
      description: `${invoice.number}${invoice.project ? ` · ${invoice.project.name}` : ""}`,
      counterparty: invoice.client.name,
      currency: invoice.currency,
      amount: formatMoney(netInvoiceValue(invoice), invoice.currency),
      status: invoice.status,
      sortDate: invoice.issueDate,
    })),
    ...actualPayouts.map((payout) => ({
      id: `delivery-accrual:${payout.id}`,
      occurredOn: date(payout.workDate),
      searchDate: payout.workDate.toISOString(),
      direction: "NON_CASH" as const,
      category: "Developer payout accrued",
      description: `${payout.project.name} · approved delivery`,
      counterparty: payout.user.name,
      currency: payout.currency,
      amount: formatMoney(payout.amount, payout.currency),
      status: "Accrued",
      sortDate: payout.workDate,
    })),
    ...activeEarningInvoices.filter((invoice) => invoice.status !== "PAID").map((invoice) => ({
      id: `earning-payable:${invoice.id}`,
      occurredOn: date(invoice.submittedAt),
      searchDate: invoice.submittedAt.toISOString(),
      direction: "NON_CASH" as const,
      category: invoice.source === "DELIVERY_PAYOUT" ? "Developer invoice payable" : "Salary invoice payable",
      description: invoice.reference,
      counterparty: invoice.user.name,
      currency: invoice.currency,
      amount: formatMoney(invoice.amount, invoice.currency),
      status: invoice.status,
      sortDate: invoice.submittedAt,
    })),
  ]
    .filter((row) => (!currency || row.currency === currency) && inRange(row.sortDate, rangeFrom))
    .sort((left, right) => right.sortDate.getTime() - left.sortDate.getTime())
    .map(({ sortDate: _sortDate, ...row }) => row);

  type ProjectEconomics = {
    id: string;
    project: string;
    client: string;
    currency: string;
    billed: number;
    invoiceSettled: number;
    developerCost: number;
    retained: number;
  };
  const projectEconomics = new Map<string, ProjectEconomics>();
  const getProjectEconomics = (projectId: string, project: string, client: string, itemCurrency: string) => {
    const key = `${projectId}:${itemCurrency}`;
    const current = projectEconomics.get(key) ?? { id: key, project, client, currency: itemCurrency, billed: 0, invoiceSettled: 0, developerCost: 0, retained: 0 };
    projectEconomics.set(key, current);
    return current;
  };
  for (const invoice of revenueInvoices) {
    if (!invoice.project) continue;
    const economics = getProjectEconomics(invoice.project.id, invoice.project.name, invoice.client.name, invoice.currency);
    economics.billed += netInvoiceValue(invoice);
    economics.invoiceSettled += Math.min(invoice.paidAmount, netInvoiceValue(invoice));
  }
  for (const payout of payouts) {
    const economics = getProjectEconomics(payout.project.id, payout.project.name, payout.project.client.name, payout.currency);
    if (payout.category === "ACTUAL_PAYOUT") economics.developerCost += payout.amount;
    else economics.retained += payout.amount;
  }
  const projectEconomicsRows = [...projectEconomics.values()]
    .filter((row) => !currency || row.currency === currency)
    .sort((left, right) => right.billed - left.billed || left.project.localeCompare(right.project));
  const visibleOpenInvoices = openInvoices.filter((invoice) => !currency || invoice.currency === currency);
  const visibleExpenses = expenses.filter((expense) => !currency || expense.currency === currency);
  const visibleC2cInvoices = c2cInvoices.filter((invoice) => !currency || invoice.currency === currency);
  const visiblePlacements = placements.filter((placement) => !currency || placement.currency === currency);
  const foreignSettlementRows = revenueInvoices.flatMap((invoice) => {
    if (!invoice.settlementCurrency || invoice.settlementCurrency === invoice.currency || invoice.lockedSettlementRate === null) return [];
    const rate = Number(invoice.lockedSettlementRate);
    if (!Number.isFinite(rate) || rate <= 0) return [];
    const payments = invoice.payments.filter((payment) => payment.settlementAmount !== null && payment.settlementCurrency === invoice.settlementCurrency);
    const applied = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const actualReceived = payments.reduce((sum, payment) => sum + payment.settlementAmount!, 0);
    const realisedFx = payments.reduce((sum, payment) => sum + (payment.realizedFxGainLoss ?? 0), 0);
    return [{
      id: invoice.id,
      number: invoice.number,
      client: invoice.client.name,
      invoiceCurrency: invoice.currency,
      invoiceValue: formatMoney(netInvoiceValue(invoice), invoice.currency),
      invoiceOutstanding: formatMoney(netOutstanding(invoice), invoice.currency),
      settlementCurrency: invoice.settlementCurrency,
      lockedRate: formatSettlementRate(rate, invoice.settlementCurrency, invoice.currency),
      expectedAtIssueRate: formatMoney(settlementAmountAtLockedRate(netInvoiceValue(invoice), rate), invoice.settlementCurrency),
      received: actualReceived > 0 ? formatMoney(actualReceived, invoice.settlementCurrency) : "—",
      applied: applied > 0 ? formatMoney(applied, invoice.currency) : "—",
      realisedFx: actualReceived > 0 ? `${realisedFx >= 0 ? "+" : "−"}${formatMoney(Math.abs(realisedFx), invoice.settlementCurrency)}` : "—",
      status: invoice.status,
    }];
  }).filter((row) => !currency || currency === row.settlementCurrency || currency === row.invoiceCurrency);
  const balanceTone = (totals: CurrencyTotals): FinanceMetric["tone"] => {
    const values = Object.values(displayTotals(totals));
    if (values.some((amount) => amount < 0)) return "negative";
    return values.some((amount) => amount > 0) ? "positive" : "default";
  };

  const metrics: FinanceMetric[] = [
    { label: "Net cash after payments", value: formatCurrencyTotals(displayTotals(cashAfterReleasedPayments)), detail: "All recorded client cash less released payments", tone: balanceTone(cashAfterReleasedPayments) },
    { label: "Receivables", value: formatCurrencyTotals(displayTotals(outstanding)), detail: `${visibleOpenInvoices.length} client invoice${visibleOpenInvoices.length === 1 ? "" : "s"} still open`, tone: "warning" },
    { label: "Net revenue before tax", value: formatCurrencyTotals(displayTotals(operatingMargin)), detail: "Accrual basis: billing less committed costs", tone: balanceTone(operatingMargin) },
    { label: "Developer cost accrued", value: formatCurrencyTotals(displayTotals(actualPayoutTotal)), detail: `${actualPayouts.length} approved delivery day${actualPayouts.length === 1 ? "" : "s"}` },
    { label: "People invoices due", value: formatCurrencyTotals(displayTotals(salaryOutstanding)), detail: "Submitted or approved salary claims", tone: "warning" },
    { label: "Pre-start retained value", value: formatCurrencyTotals(displayTotals(companyRetainedTotal)), detail: "Disclosed separately; never extra revenue" },
  ];

  // This is an explicit operational rollback switch while the command centre
  // rolls out. It is off in every normal environment; retaining it avoids
  // losing access to a detailed audit view if an operator needs it urgently.
  if (process.env.QONIC_LEGACY_FINANCE === "1") return <div className="portal-page company-finance">
    <header className="hero-panel">
      <span className="hero-eyebrow">Finance overview</span>
      <h1 className="hero-title">Company Finance</h1>
      <p className="hero-lead">A cash, receivables, delivery-cost, expense, C2C, and placement view. Different currencies are displayed separately; no exchange-rate conversion is assumed.</p>
      <div className="hero-stats">
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(billed)}</span><p className="hero-stat-label">Client invoices issued</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(received)}</span><p className="hero-stat-label">Client cash received</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(outstanding)}</span><p className="hero-stat-label">Receivables outstanding</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(actualPayoutTotal)}</span><p className="hero-stat-label">Developer payout accrued</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(developerPaid)}</span><p className="hero-stat-label">Developer payments released</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(salaryOutstanding)}</span><p className="hero-stat-label">People salary invoices due</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(cashAfterReleasedPayments)}</span><p className="hero-stat-label">Actual company cash after payments</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(companyRetainedTotal)}</span><p className="hero-stat-label">Pre-start value retained</p></div>
        <div><span className="hero-stat-value" style={{ fontSize: "1.35rem" }}>{formatCurrencyTotals(approvedExpenses)}</span><p className="hero-stat-label">Approved expenses</p></div>
      </div>
    </header>

    <section className="portal-section">
      <h2 className="portal-section-title">Cash and commitments</h2>
      <p className="portal-note">Client billed is net of credit notes. Developer payouts are accrued from each Developer&apos;s Actual Start Date. People salary invoices are payables only once the person raises them. Actual company cash after payments is the live cash view: client cash received, less released Developer payments, paid People salaries, and reimbursed expenses. Pre-start approved work is billed to the client but stays outside Developer payout; it is retained delivery value, never added to revenue a second time.</p>
      {financeCurrencies.length === 0 ? <p className="portal-muted">No finance activity has been recorded yet.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Currency</th><th scope="col">Client billed, net</th><th scope="col">Client cash received</th><th scope="col">Developer payments released</th><th scope="col">People salaries paid</th><th scope="col">Cash expenses reimbursed</th><th scope="col">Actual company cash after payments</th><th scope="col">Developer payout accrued</th><th scope="col">People salary payable</th><th scope="col">Approved expenses pending</th><th scope="col">Net revenue before tax</th><th scope="col">Pre-start value retained*</th></tr></thead>
        <tbody>{financeCurrencies.map((currency) => <tr key={currency}>
          <th scope="row">{currency}</th>
          <td>{formatMoney(amountAt(billed, currency), currency)}</td>
          <td>{formatMoney(amountAt(received, currency), currency)}</td>
          <td>−{formatMoney(amountAt(developerPaid, currency), currency)}</td>
          <td>−{formatMoney(amountAt(salaryPaid, currency), currency)}</td>
          <td>{formatMoney(amountAt(reimbursedExpenses, currency), currency)}</td>
          <td><strong>{formatMoney(amountAt(cashAfterReleasedPayments, currency), currency)}</strong></td>
          <td>{formatMoney(amountAt(actualPayoutTotal, currency), currency)}</td>
          <td>{formatMoney(amountAt(salaryPayable, currency), currency)}</td>
          <td>{formatMoney(amountAt(awaitingExpensePayment, currency), currency)}</td>
          <td>{formatMoney(amountAt(operatingMargin, currency), currency)}</td>
          <td>{formatMoney(amountAt(companyRetainedTotal, currency), currency)}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className="field-hint">*Retained delivery value is the contract-based payout amount that is not owed to a Developer for approved pre-start work. It is not an extra invoice or extra cash revenue.</p>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Net company revenue breakdown</h2>
      <p className="portal-note">This is the accrual view of company performance, not a cash balance: net client billing less delivery payout accrued, raised People salary invoices, and approved expense commitments. A Developer payment does not reduce this figure again because the cost was already accrued when their delivery was approved; its cash impact appears above in Actual company cash after payments. Credit notes reduce client billing; pre-start retained value remains a disclosure only, never a second revenue line.</p>
      {financeCurrencies.length === 0 ? <p className="portal-muted">Net company revenue will appear after financial activity is recorded.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Currency</th><th scope="col">Net client billing</th><th scope="col">Less Developer payout accrued</th><th scope="col">Less People salaries invoiced</th><th scope="col">Less approved expenses</th><th scope="col">Net company revenue before tax</th></tr></thead>
        <tbody>{financeCurrencies.map((currency) => <tr key={currency}>
          <th scope="row">{currency}</th><td>{formatMoney(amountAt(billed, currency), currency)}</td><td>−{formatMoney(amountAt(actualPayoutTotal, currency), currency)}</td><td>−{formatMoney(amountAt(salaryPayable, currency), currency)}</td><td>−{formatMoney(amountAt(approvedExpenses, currency), currency)}</td><td><strong>{formatMoney(amountAt(operatingMargin, currency), currency)}</strong></td>
        </tr>)}</tbody>
      </table></div>}
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Receivables and collection</h2>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{openInvoices.length}</span><p>Open client invoices</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(outstanding)}</span><p>Outstanding collection</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(cashAfterReleasedPayments)}</span><p>Actual company cash after payments</p></article>
      </div>
      {openInvoices.length === 0 ? <p className="portal-muted">No client receivables are outstanding.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice</th><th scope="col">Client / Project</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Issued</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead>
        <tbody>{openInvoices.map((invoice) => <tr key={invoice.id}>
          <th scope="row"><strong>{invoice.number}</strong><span>{invoice.commercialKind === "QONIC_TO_VENDOR" ? "C2C Qonic claim" : "Client invoice"}</span></th>
          <td>{invoice.client.name}<span>{invoice.project?.name ?? "No project"}</span></td>
          <td>{date(invoice.dueDate)}<span>{BUCKET_LABELS[ageingBucket(invoice.dueDate)]}</span></td>
          <td><StatusChip status={invoice.status} /></td>
          <td>{formatMoney(netInvoiceValue(invoice), invoice.currency)}{creditValue(invoice) > 0 && <span>Credit notes: −{formatMoney(creditValue(invoice), invoice.currency)}</span>}</td>
          <td>{formatMoney(Math.min(invoice.paidAmount, netInvoiceValue(invoice)), invoice.currency)}</td>
          <td>{formatMoney(netOutstanding(invoice), invoice.currency)}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Receivable age</th><th scope="col">Outstanding amount</th></tr></thead>
        <tbody>{BUCKETS.map((bucket) => <tr key={bucket}><th scope="row">{BUCKET_LABELS[bucket]}</th><td>{formatCurrencyTotals(ageing.get(bucket) ?? {})}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">People earnings invoices</h2>
      <p className="portal-note">Every Qonic account raises its own monthly invoice from My Earnings. Developers invoice approved delivery payout; CEO, Co-Founder, and People accounts invoice their effective-dated salary schedule. A submitted Developer invoice documents payout already accrued above and is not deducted twice.</p>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(salaryOutstanding)}</span><p>People salary invoices awaiting payment</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(salaryPaid)}</span><p>People salary invoices paid</p></article>
        <article className="portal-card"><span className="portal-stat">{earningInvoices.filter((invoice) => ["SUBMITTED", "APPROVED"].includes(invoice.status)).length}</span><p>Open earnings invoices</p></article>
      </div>
      <EarningsInvoiceManager invoices={earningsInvoiceRows} />
    </section>

    {canDecideEarnings && <section className="portal-section">
      <h2 className="portal-section-title">Urgent current-month invoice access</h2>
      <p className="portal-note">CEO and Co-Founder only. Enable a single, audited early raise for one person and one currency when urgent payment is necessary. It never opens invoices globally. For Developers, only approved payout accrued today is included; approved delivery earned later is kept for a supplemental invoice after month close.</p>
      <EarningsEarlyReleaseManager releases={earningEarlyReleaseRows} />
    </section>}

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

    {expenses.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Operating expenses</h2>
      <p className="portal-note">Approved expenses are commitments; reimbursed expenses have left company cash. Both remain visible so finance can distinguish what is owed from what has been paid.</p>
      <div className="portal-grid">
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(approvedExpenses)}</span><p>Approved commitments</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(reimbursedExpenses)}</span><p>Reimbursed / cash paid</p></article>
        <article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(awaitingExpensePayment)}</span><p>Awaiting reimbursement</p></article>
      </div>
      <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Date</th><th scope="col">Expense</th><th scope="col">Claimed by</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Amount</th></tr></thead>
        <tbody>{expenses.map((expense) => <tr key={expense.id}>
          <td>{date(expense.spentOn)}</td>
          <th scope="row"><strong>{expense.category}</strong><span>{expense.description}</span></th>
          <td>{expense.user.name}</td><td>{expense.project?.name ?? "Company-wide"}</td>
          <td><StatusChip status={expense.status} /></td><td>{formatMoney(expense.amount, expense.currency)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {c2cInvoices.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">C2C reconciliation</h2>
      <p className="portal-note">Only the Qonic claim is counted as company revenue. Vendor and Global Candidate commissions are recorded for reconciliation, but remain vendor-held money.</p>
      <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice / Client</th><th scope="col">Gross client amount</th><th scope="col">Qonic claim</th><th scope="col">Vendor commission</th><th scope="col">Global Candidate commission</th><th scope="col">Status</th></tr></thead>
        <tbody>{c2cInvoices.map((invoice) => <tr key={invoice.id}>
          <th scope="row"><strong>{invoice.number}</strong><span>{invoice.client.name}</span></th>
          <td>{formatMoney(invoice.grossClientAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.qonicRevenueAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.vendorCommissionAmount, invoice.currency)}</td>
          <td>{formatMoney(invoice.globalCandidateCommissionAmount, invoice.currency)}</td>
          <td><StatusChip status={invoice.status} /></td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {placements.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Placement fee pipeline</h2>
      <p className="portal-note">Placement fees are earned-fee records. They are shown separately until invoiced and paid, so they are not mixed into client cash received above.</p>
      <div className="portal-grid"><article className="portal-card"><span className="portal-stat">{formatCurrencyTotals(placementFees)}</span><p>Active placement fees</p></article><article className="portal-card"><span className="portal-stat">{placements.length}</span><p>Active placements</p></article></div>
      <div className="matrix-scroll"><table className="matrix matrix--people">
        <thead><tr><th scope="col">Candidate</th><th scope="col">Client</th><th scope="col">Start</th><th scope="col">Fee</th><th scope="col">Recruiter</th></tr></thead>
        <tbody>{placements.map((placement) => <tr key={placement.id}>
          <th scope="row"><strong>{placement.application.candidate.name}</strong><span>{placement.application.job.title}</span></th>
          <td>{placement.application.job.client.name}</td><td>{date(placement.startDate)}</td>
          <td>{formatMoney(placement.feeAmount, placement.currency)}<span>{placement.feePercent}%</span></td><td>{placement.recruiter?.name ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;

  return <CompanyFinanceWorkspace
    range={range}
    currency={currency}
    currencies={financeCurrencies}
    metrics={metrics}
    cashFlow={cashFlow}
    cashFlowCurrency={cashFlowCurrency}
    overview={<>
      <section className="portal-section finance-workspace__summary">
        <div className="finance-workspace__section-heading">
          <div><span className="hero-eyebrow">Performance</span><h2>Net company revenue</h2></div>
          <p>{periodLabel}. Revenue is shown on an accrual basis; cash is kept separately so developer payments are never deducted twice.</p>
        </div>
        {visibleCurrencies.length === 0 ? <p className="portal-muted">No finance activity has been recorded for this currency.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
          <thead><tr><th scope="col">Currency</th><th scope="col">Net client billing</th><th scope="col">Delivery cost accrued</th><th scope="col">Salary invoices</th><th scope="col">Approved expenses</th><th scope="col">Net revenue before tax</th></tr></thead>
          <tbody>{visibleCurrencies.map((item) => <tr key={item}>
            <th scope="row">{item}</th><td>{formatMoney(amountAt(billed, item), item)}</td><td>−{formatMoney(amountAt(actualPayoutTotal, item), item)}</td><td>−{formatMoney(amountAt(salaryPayable, item), item)}</td><td>−{formatMoney(amountAt(approvedExpenses, item), item)}</td><td><strong>{formatMoney(amountAt(operatingMargin, item), item)}</strong></td>
          </tr>)}</tbody>
        </table></div>}
        <p className="field-hint">Pre-start retained delivery value is disclosed in Projects. It is not a second invoice, cash receipt, or revenue line.</p>
      </section>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Attention</span><h2>Finance watchlist</h2></div><p>The items most likely to affect working capital or require action.</p></div>
        <div className="finance-workspace__watchlist">
          <article><span>Collection risk</span><strong>{formatCurrencyTotals(displayTotals(outstanding))}</strong><p>{visibleOpenInvoices.length} open client invoice{visibleOpenInvoices.length === 1 ? "" : "s"} across the selected currency view.</p></article>
          <article><span>Payables awaiting release</span><strong>{formatCurrencyTotals(displayTotals(salaryOutstanding))}</strong><p>People invoices submitted or approved but not marked paid.</p></article>
          <article><span>Missing pre-start time</span><strong>{isExecutive ? prestartBackfillFlags.length : "—"}</strong><p>{isExecutive ? "Executive-only delivery gaps that may need controlled reopening." : "Visible to CEO and Co-Founder only."}</p></article>
        </div>
      </section>
    </>}
    cash={<>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Cash position</span><h2>Cash and commitments</h2></div><p>Actual cash reflects money received less money that has already left Qonic. It does not treat accrued delivery cost as a second cash payment.</p></div>
        {visibleCurrencies.length === 0 ? <p className="portal-muted">No cash activity has been recorded for this currency.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
          <thead><tr><th scope="col">Currency</th><th scope="col">Client cash received</th><th scope="col">Realised FX gain / loss*</th><th scope="col">Developer payments released</th><th scope="col">People salaries paid</th><th scope="col">Expenses reimbursed</th><th scope="col">Net cash after payments</th></tr></thead>
          <tbody>{visibleCurrencies.map((item) => <tr key={item}><th scope="row">{item}</th><td>{formatMoney(amountAt(received, item), item)}</td><td>{amountAt(realizedFxGainLoss, item) < 0 ? "−" : amountAt(realizedFxGainLoss, item) > 0 ? "+" : ""}{formatMoney(Math.abs(amountAt(realizedFxGainLoss, item)), item)}</td><td>−{formatMoney(amountAt(developerPaid, item), item)}</td><td>−{formatMoney(amountAt(salaryPaid, item), item)}</td><td>−{formatMoney(amountAt(reimbursedExpenses, item), item)}</td><td><strong>{formatMoney(amountAt(cashAfterReleasedPayments, item), item)}</strong></td></tr>)}</tbody>
        </table></div>}
        <p className="field-hint">*Realised FX is already included in client cash received. It is shown separately for reconciliation and is never added to cash a second time.</p>
      </section>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Commitments</span><h2>Cash not released yet</h2></div><p>These are approved or invoiced obligations, not deductions from cash until a payment is recorded.</p></div>
        <div className="finance-workspace__watchlist">
          <article><span>Developer payout accrued</span><strong>{formatCurrencyTotals(displayTotals(actualPayoutTotal))}</strong><p>Approved delivery from each Developer&apos;s Actual Start Date.</p></article>
          <article><span>Salary invoices awaiting payment</span><strong>{formatCurrencyTotals(displayTotals(salaryOutstanding))}</strong><p>Only invoices raised by People appear here.</p></article>
          <article><span>Expense reimbursement pending</span><strong>{formatCurrencyTotals(displayTotals(awaitingExpensePayment))}</strong><p>Approved expense claims still awaiting reimbursement.</p></article>
        </div>
      </section>
    </>}
    collections={<>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Accounts receivable</span><h2>Collection queue</h2></div><p>Issued is net of credit notes. Outstanding remains visible until the invoice is settled or voided.</p></div>
        {visibleOpenInvoices.length === 0 ? <p className="portal-muted">No client receivables are outstanding.</p> : <div className="matrix-scroll"><table className="matrix matrix--people">
          <thead><tr><th scope="col">Invoice</th><th scope="col">Client / Project</th><th scope="col">Due / age</th><th scope="col">Status</th><th scope="col">Net issued</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead>
          <tbody>{visibleOpenInvoices.map((invoice) => <tr key={invoice.id}><th scope="row"><strong>{invoice.number}</strong><span>{invoice.commercialKind === "QONIC_TO_VENDOR" ? "C2C Qonic claim" : "Client invoice"}</span></th><td>{invoice.client.name}<span>{invoice.project?.name ?? "No project"}</span></td><td>{date(invoice.dueDate)}<span>{BUCKET_LABELS[ageingBucket(invoice.dueDate)]}</span></td><td><StatusChip status={invoice.status} /></td><td>{formatMoney(netInvoiceValue(invoice), invoice.currency)}</td><td>{formatMoney(Math.min(invoice.paidAmount, netInvoiceValue(invoice)), invoice.currency)}</td><td><strong>{formatMoney(netOutstanding(invoice), invoice.currency)}</strong></td></tr>)}</tbody>
        </table></div>}
        <div className="matrix-scroll"><table className="matrix matrix--people finance-workspace__ageing"><thead><tr><th scope="col">Receivable age</th><th scope="col">Outstanding amount</th></tr></thead><tbody>{BUCKETS.map((bucket) => <tr key={bucket}><th scope="row">{BUCKET_LABELS[bucket]}</th><td>{formatCurrencyTotals(displayTotals(ageing.get(bucket) ?? {}))}</td></tr>)}</tbody></table></div>
      </section>
      {visibleC2cInvoices.length > 0 && <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">C2C</span><h2>Commercial reconciliation</h2></div><p>Only the Qonic claim is company revenue; vendor and Global Candidate commissions remain vendor-held money.</p></div>
        <div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Invoice / client</th><th scope="col">Gross client amount</th><th scope="col">Qonic claim</th><th scope="col">Vendor commission</th><th scope="col">Global Candidate commission</th><th scope="col">Status</th></tr></thead><tbody>{visibleC2cInvoices.map((invoice) => <tr key={invoice.id}><th scope="row"><strong>{invoice.number}</strong><span>{invoice.client.name}</span></th><td>{formatMoney(invoice.grossClientAmount, invoice.currency)}</td><td>{formatMoney(invoice.qonicRevenueAmount, invoice.currency)}</td><td>{formatMoney(invoice.vendorCommissionAmount, invoice.currency)}</td><td>{formatMoney(invoice.globalCandidateCommissionAmount, invoice.currency)}</td><td><StatusChip status={invoice.status} /></td></tr>)}</tbody></table></div>
      </section>}
      {foreignSettlementRows.length > 0 && <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">FX settlement</span><h2>Foreign invoice to INR reconciliation</h2></div><p>The invoice stays in its contractual currency. The difference between its locked INR value and the actual bank receipt is a realised FX gain or loss, not a revenue correction.</p></div>
        <div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Invoice / client</th><th scope="col">Contract invoice</th><th scope="col">Locked settlement rate</th><th scope="col">Expected at issue rate</th><th scope="col">Actual INR received</th><th scope="col">Applied / outstanding</th><th scope="col">Realised FX</th><th scope="col">Status</th></tr></thead><tbody>{foreignSettlementRows.map((row) => <tr key={row.id}><th scope="row"><strong>{row.number}</strong><span>{row.client}</span></th><td>{row.invoiceValue}</td><td>{row.lockedRate}</td><td>{row.expectedAtIssueRate}</td><td>{row.received}</td><td>{row.applied}<span>Outstanding: {row.invoiceOutstanding}</span></td><td>{row.realisedFx}</td><td><StatusChip status={row.status} /></td></tr>)}</tbody></table></div>
      </section>}
    </>}
    payables={<>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">People payables</span><h2>Earnings invoice queue</h2></div><p>Every Qonic account raises an invoice from My Earnings. Developer invoices settle delivery payout already accrued; salary invoices follow the effective-dated compensation schedule.</p></div>
        <div className="finance-workspace__watchlist"><article><span>People salary invoices due</span><strong>{formatCurrencyTotals(displayTotals(salaryOutstanding))}</strong><p>Submitted or approved monthly salary claims.</p></article><article><span>Salary invoices paid</span><strong>{formatCurrencyTotals(displayTotals(salaryPaid))}</strong><p>Cash already released to People.</p></article><article><span>Developer invoices paid</span><strong>{formatCurrencyTotals(displayTotals(developerPaid))}</strong><p>Delivery payouts released against approved work.</p></article></div>
        <EarningsInvoiceManager invoices={earningsInvoiceRows} />
      </section>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Expenses</span><h2>Operating expense claims</h2></div><p>Approved claims are commitments. Reimbursed claims are cash outflows and appear in the ledger.</p></div>
        {visibleExpenses.length === 0 ? <p className="portal-muted">No approved or reimbursed expenses are recorded for this currency.</p> : <div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Date</th><th scope="col">Expense</th><th scope="col">Claimed by</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Amount</th></tr></thead><tbody>{visibleExpenses.map((expense) => <tr key={expense.id}><td>{date(expense.spentOn)}</td><th scope="row"><strong>{expense.category}</strong><span>{expense.description}</span></th><td>{expense.user.name}</td><td>{expense.project?.name ?? "Company-wide"}</td><td><StatusChip status={expense.status} /></td><td>{formatMoney(expense.amount, expense.currency)}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
    delivery={<>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Project economics</span><h2>Billing and delivery cost</h2></div><p>Each project and currency is kept separate. Pre-start value is a retained payout classification, not additional client revenue.</p></div>
        {projectEconomicsRows.length === 0 ? <p className="portal-muted">Project economics appear after client billing or approved delivery is recorded.</p> : <div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Project / client</th><th scope="col">Billed</th><th scope="col">Invoice amount settled</th><th scope="col">Developer cost accrued</th><th scope="col">Pre-start retained</th><th scope="col">Gross contribution*</th></tr></thead><tbody>{projectEconomicsRows.map((row) => <tr key={row.id}><th scope="row"><strong>{row.project}</strong><span>{row.client} · {row.currency}</span></th><td>{formatMoney(row.billed, row.currency)}</td><td>{formatMoney(row.invoiceSettled, row.currency)}</td><td>−{formatMoney(row.developerCost, row.currency)}</td><td>{formatMoney(row.retained, row.currency)}</td><td><strong>{formatMoney(row.billed - row.developerCost, row.currency)}</strong></td></tr>)}</tbody></table></div>}
        <p className="field-hint">*Before people salaries, operating expenses, tax, and other company costs.</p>
      </section>
      <section className="portal-section">
        <div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Daily audit</span><h2>Developer payout and retained delivery</h2></div><p>Expand a Developer–Project row to see every approved date, its billable hours, invoice state, and payout classification.</p></div>
        {deliveryFinanceAssignments.length === 0 ? <p className="portal-muted">Daily finance entries appear when approved billable timesheets exist.</p> : <ExpandableDeliveryFinance assignments={deliveryFinanceAssignments} />}
      </section>
    </>}
    ledger={<section className="portal-section"><div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Audit trail</span><h2>Finance ledger</h2></div><p>{periodLabel}. Cash receipts and payments sit beside non-cash accruals, with movement type clearly labelled.</p></div><FinanceLedger rows={ledgerRows} /></section>}
    operations={<>
      {canDecideEarnings && <section className="portal-section"><div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Controlled exception</span><h2>Urgent invoice access</h2></div><p>CEO and Co-Founder can enable one auditable current-month invoice raise for one person and currency. It never opens invoice raising globally.</p></div><EarningsEarlyReleaseManager releases={earningEarlyReleaseRows} /></section>}
      {isExecutive && prestartBackfillFlags.length > 0 && <section className="portal-section company-finance__prestart-flags"><div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Delivery exception</span><h2>Missing pre-start delivery time</h2></div><p>Only unfiled weekdays between project start and the Developer&apos;s Actual Start Date appear. Reopening creates editable drafts; it does not create hours, revenue, or payout.</p></div><PrestartBackfillFlags flags={prestartBackfillFlags} /><p className="field-hint">Invoiced weeks stay flagged but cannot be reopened here, preserving invoice history.</p></section>}
      {visiblePlacements.length > 0 && <section className="portal-section"><div className="finance-workspace__section-heading"><div><span className="hero-eyebrow">Pipeline</span><h2>Placement fee pipeline</h2></div><p>Earned placement fees remain separate from client cash until an invoice is issued and paid.</p></div><div className="matrix-scroll"><table className="matrix matrix--people"><thead><tr><th scope="col">Candidate</th><th scope="col">Client</th><th scope="col">Start</th><th scope="col">Fee</th><th scope="col">Recruiter</th></tr></thead><tbody>{visiblePlacements.map((placement) => <tr key={placement.id}><th scope="row"><strong>{placement.application.candidate.name}</strong><span>{placement.application.job.title}</span></th><td>{placement.application.job.client.name}</td><td>{date(placement.startDate)}</td><td>{formatMoney(placement.feeAmount, placement.currency)}<span>{placement.feePercent}%</span></td><td>{placement.recruiter?.name ?? "—"}</td></tr>)}</tbody></table></div></section>}
      {!canDecideEarnings && !isExecutive && visiblePlacements.length === 0 && <section className="portal-section"><p className="portal-muted">No finance controls are available for your role.</p></section>}
    </>}
  />;
}
