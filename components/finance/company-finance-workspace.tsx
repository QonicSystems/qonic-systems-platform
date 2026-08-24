"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type FinanceTab = "overview" | "cash" | "collections" | "payables" | "delivery" | "ledger" | "operations";

export type FinanceMetric = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "warning" | "negative";
};

export type FinanceCashFlowPoint = {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
};

const tabs: Array<{ id: FinanceTab; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Executive finance snapshot" },
  { id: "cash", label: "Cash flow", description: "Cash received and released" },
  { id: "collections", label: "Revenue & AR", description: "Billing and collections" },
  { id: "payables", label: "Payables", description: "Payroll and expenses" },
  { id: "delivery", label: "Projects", description: "Delivery cost and margin" },
  { id: "ledger", label: "Finance ledger", description: "Searchable event trail" },
  { id: "operations", label: "Controls", description: "Exceptions and finance actions" },
];

function moneyMagnitude(value: number): string {
  const amount = Math.abs(value) / 100;
  if (amount >= 100_000) return `${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(0);
}

/**
 * The client boundary for Company Finance. Server-rendered tab content keeps
 * sensitive calculation data on the server; filter transitions use Next's RSC
 * navigation so the workspace changes without a browser page reload.
 */
export function CompanyFinanceWorkspace({
  range,
  currency,
  currencies,
  metrics,
  cashFlow,
  cashFlowCurrency,
  overview,
  cash,
  collections,
  payables,
  delivery,
  ledger,
  operations,
}: {
  range: "30d" | "90d" | "ytd" | "all";
  currency: string | null;
  currencies: ReadonlyArray<string>;
  metrics: ReadonlyArray<FinanceMetric>;
  cashFlow: ReadonlyArray<FinanceCashFlowPoint>;
  cashFlowCurrency: string | null;
  overview: ReactNode;
  cash: ReactNode;
  collections: ReactNode;
  payables: ReactNode;
  delivery: ReactNode;
  ledger: ReactNode;
  operations: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const content: Record<FinanceTab, ReactNode> = { overview, cash, collections, payables, delivery, ledger, operations };
  const maxFlow = useMemo(() => Math.max(1, ...cashFlow.flatMap((point) => [point.inflow, point.outflow])), [cashFlow]);

  const updateFilter = (key: "range" | "currency", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 400);
  };

  return <div className="portal-page company-finance finance-workspace">
    <header className="finance-workspace__hero">
      <div>
        <span className="hero-eyebrow">Finance command centre</span>
        <h1 className="hero-title">Company Finance</h1>
        <p className="hero-lead">Live cash, revenue, payables, project economics, and finance controls. Every total keeps currencies separate.</p>
      </div>
      <div className="finance-workspace__filters" aria-label="Company finance filters">
        <label>
          <span>Period</span>
          <select value={range} onChange={(event) => updateFilter("range", event.target.value)}>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label>
          <span>Currency</span>
          <select value={currency ?? "all"} onChange={(event) => updateFilter("currency", event.target.value)}>
            <option value="all">All currencies</option>
            {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="button button-outline" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>

    <section className="finance-workspace__metrics" aria-label="Finance highlights">
      {metrics.map((metric) => <article key={metric.label} className={`finance-metric finance-metric--${metric.tone ?? "default"}`}>
        <span className="finance-metric__label">{metric.label}</span>
        <strong className="finance-metric__value">{metric.value.split(" · ").map((amount) => <span key={amount}>{amount}</span>)}</strong>
        <span className="finance-metric__detail">{metric.detail}</span>
      </article>)}
    </section>

    <nav className="finance-workspace__tabs" aria-label="Company Finance views">
      {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)}>
        <span>{tab.label}</span><small>{tab.description}</small>
      </button>)}
    </nav>

    {(activeTab === "overview" || activeTab === "cash") && <section className="finance-workspace__trend" aria-labelledby="cash-flow-title">
      <div className="finance-workspace__section-heading">
        <div><span className="hero-eyebrow">Cash movement</span><h2 id="cash-flow-title">Cash in vs payments out{cashFlowCurrency ? ` · ${cashFlowCurrency}` : ""}</h2></div>
        <p>Cash is shown independently from accrual revenue. Select a currency to avoid artificial conversion.</p>
      </div>
      {cashFlowCurrency && cashFlow.length > 0 ? <div className="finance-flow-chart" role="img" aria-label={`Cash movement for ${cashFlowCurrency}`}>
        {cashFlow.map((point) => <div key={point.label} className="finance-flow-chart__bar" title={`${point.label}: in ${moneyMagnitude(point.inflow)}, out ${moneyMagnitude(point.outflow)}`}>
          <div className="finance-flow-chart__columns"><span className="finance-flow-chart__in" style={{ height: `${Math.max(4, (point.inflow / maxFlow) * 100)}%` }} /><span className="finance-flow-chart__out" style={{ height: `${Math.max(4, (point.outflow / maxFlow) * 100)}%` }} /></div>
          <span>{point.label}</span>
        </div>)}
      </div> : <p className="portal-muted">Select a currency with recorded cash movement to view the cash-flow trend.</p>}
      <div className="finance-flow-chart__legend"><span><i className="finance-flow-chart__in" /> Cash in</span><span><i className="finance-flow-chart__out" /> Payments out</span></div>
    </section>}

    <div className="finance-workspace__content" key={activeTab}>{content[activeTab]}</div>
  </div>;
}
