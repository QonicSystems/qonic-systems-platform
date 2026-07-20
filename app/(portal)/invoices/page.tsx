import { InvoiceManager } from "@/components/finance/invoice-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { ageingBucket, formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const context = await requirePermission("invoice.view");

  const [invoices, clients, projects] = await Promise.all([
    db.invoice.findMany({ include: { client: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { issueDate: "desc" } }),
    db.client.findMany({ where: { status: { in: ["ACTIVE", "PROSPECT"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
  ]);

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
  </div>;
}
