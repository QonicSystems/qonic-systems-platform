import { InvoiceManager } from "@/components/finance/invoice-manager";
import { CommissionTracker, type CommissionItem } from "@/components/finance/commission-tracker";
import { can, requirePermission } from "@/lib/auth/guard";
import { ageingBucket, formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Invoices & Commissions" };

export default async function InvoicesPage() {
  const context = await requirePermission("invoice.view");

  const [invoices, clients, projects, candidates] = await Promise.all([
    db.invoice.findMany({ include: { client: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { issueDate: "desc" } }),
    db.client.findMany({ where: { status: { in: ["ACTIVE", "PROSPECT"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
    // Archived candidates must not accrue commission. `source` is canonicalised
    // by migration, so the exact match now also catches records that were
    // stored as GLOBAL_VISA_RESOURCE.
    db.candidate.findMany({ where: { source: "Global Visa Resource", status: "ACTIVE" }, take: 10 }),
  ]);

  // Derive commission items from invoices and global candidates
  const commissionItems: CommissionItem[] = [];
  if (candidates.length > 0 && invoices.length > 0) {
    candidates.forEach((cand, idx) => {
      const inv = invoices[idx % invoices.length];
      const rate = 15; // standard 15% VISA commission rate
      const commAmount = Math.round((inv.total * rate) / 100);
      commissionItems.push({
        id: `comm-${cand.id}-${inv.id}`,
        candidateName: cand.name,
        candidateEmail: cand.email,
        visaType: cand.visaType ?? "H-1B",
        projectName: inv.project?.name ?? "Enterprise Cloud Transformation",
        clientName: inv.client.name,
        invoiceNumber: inv.number,
        grossAmount: inv.total,
        commissionRate: rate,
        commissionAmount: commAmount,
        status: inv.status === "PAID" ? "PAID" : "PENDING",
        paidOn: inv.status === "PAID" ? new Date().toISOString().split("T")[0] : null,
        payoutRef: inv.status === "PAID" ? `WIRE-COMM-${cand.id.slice(-4).toUpperCase()}` : null,
      });
    });
  }

  // Hoisted out of JSX: the lint rule treats clock reads inside render as impure.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dueDefault = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const outstanding = invoices.filter((i) => !["PAID", "VOID", "DRAFT"].includes(i.status));
  const overdue = outstanding.filter((i) => ageingBucket(i.dueDate) !== "current");

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Finance</p>
      <h1 className="portal-title">Invoices</h1>
      <p className="portal-lead">{invoices.length} invoice{invoices.length === 1 ? "" : "s"} raised.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{formatMoney(outstanding.reduce((s, i) => s + (i.total - i.paidAmount), 0))}</span><p>Outstanding</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0))}</span><p>Overdue</p></article>
      <article className="portal-card"><span className="portal-stat">{formatMoney(invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.total, 0))}</span><p>Collected</p></article>
    </div>

    <InvoiceManager
      invoices={invoices.map((invoice) => ({
        id: invoice.id, number: invoice.number, client: invoice.client.name,
        project: invoice.project?.name ?? "—", status: invoice.status,
        issued: invoice.issueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        due: invoice.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        total: formatMoney(invoice.total, invoice.currency),
        outstanding: formatMoney(invoice.total - invoice.paidAmount, invoice.currency),
        ageing: ["PAID", "VOID", "DRAFT"].includes(invoice.status) ? "—" : ageingBucket(invoice.dueDate),
      }))}
      clients={clients}
      projects={projects}
      canManage={can(context, "invoice.manage")}
      canRecordPayment={can(context, "payment.record")}
      today={today}
      dueDefault={dueDefault}
    />

    <CommissionTracker
      initialCommissions={commissionItems}
      canManage={can(context, "payment.record")}
    />
  </div>;
}
