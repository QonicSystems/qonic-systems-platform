import { InvoiceManager } from "@/components/finance/invoice-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { ageingBucket, formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const context = await requirePermission("invoice.view");

  const [invoices, clients, projects] = await Promise.all([
    // Lines, payments and credit notes are all loaded: each was written by the
    // app and read back nowhere, so an invoice could not be inspected at all.
    db.invoice.findMany({
      include: {
        client: { select: { name: true } },
        project: { select: { name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { paidOn: "desc" } },
        creditNotes: { orderBy: { issuedAt: "desc" } },
      },
      orderBy: { issueDate: "desc" },
    }),
    db.client.findMany({ where: { status: { in: ["ACTIVE", "PROSPECT"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
  ]);

  // CreditNote.issuedById has no relation, so issuer names are resolved in one
  // pass rather than a query per note.
  const issuerIds = [...new Set(invoices.flatMap((i) => i.creditNotes.map((n) => n.issuedById).filter((v): v is string => Boolean(v))))];
  const issuers = issuerIds.length
    ? await db.user.findMany({ where: { id: { in: issuerIds } }, select: { id: true, name: true } })
    : [];
  const issuerName = new Map(issuers.map((u) => [u.id, u.name]));

  // Hoisted out of JSX: the lint rule treats clock reads inside render as impure.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dueDefault = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const revenueInvoices = invoices.filter((i) => ["STANDARD", "QONIC_TO_VENDOR"].includes(i.commercialKind));
  const outstanding = revenueInvoices.filter((i) => !["PAID", "VOID", "DRAFT"].includes(i.status));
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
      <article className="portal-card"><span className="portal-stat">{formatMoney(revenueInvoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.paidAmount, 0))}</span><p>Qonic revenue received</p></article>
    </div>

    <InvoiceManager
      invoices={invoices.map((invoice) => ({
        id: invoice.id, number: invoice.number, client: invoice.client.name,
        commercialKind: invoice.commercialKind, billingRecipient: invoice.billingRecipient ?? "",
        project: invoice.project?.name ?? "—", status: invoice.status,
        issued: invoice.issueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        due: invoice.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        total: formatMoney(invoice.total, invoice.currency),
        outstanding: formatMoney(invoice.total - invoice.paidAmount, invoice.currency),
        ageing: ["PAID", "VOID", "DRAFT"].includes(invoice.status) ? "—" : ageingBucket(invoice.dueDate),
        subtotal: formatMoney(invoice.subtotal, invoice.currency),
        taxPercent: invoice.taxPercent,
        taxAmount: formatMoney(invoice.taxAmount, invoice.currency),
        notes: invoice.notes ?? "",
        grossClientAmount: invoice.grossClientAmount === null ? "" : formatMoney(invoice.grossClientAmount, invoice.currency),
        vendorCommissionAmount: invoice.vendorCommissionAmount === null ? "" : formatMoney(invoice.vendorCommissionAmount, invoice.currency),
        globalCandidateCommissionAmount: invoice.globalCandidateCommissionAmount === null ? "" : formatMoney(invoice.globalCandidateCommissionAmount, invoice.currency),
        qonicRevenueAmount: invoice.qonicRevenueAmount === null ? "" : formatMoney(invoice.qonicRevenueAmount, invoice.currency),
        lines: invoice.lines.map((line) => ({
          id: line.id,
          description: line.description,
          // Quantity is stored in hundredths so part-hours survive rounding.
          quantity: (line.quantity / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
          unitRate: formatMoney(line.unitRate, invoice.currency),
          amount: formatMoney(line.amount, invoice.currency),
        })),
        payments: invoice.payments.map((p) => ({
          id: p.id,
          amount: formatMoney(p.amount, invoice.currency),
          paidOn: p.paidOn.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
          method: p.method ?? "",
          reference: p.reference ?? "",
        })),
        creditNotes: invoice.creditNotes.map((n) => ({
          id: n.id,
          number: n.number,
          amount: formatMoney(n.amount, invoice.currency),
          reason: n.reason,
          issuedOn: n.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
          issuedBy: n.issuedById ? issuerName.get(n.issuedById) ?? "—" : "—",
        })),
        creditable: formatMoney(
          Math.max(0, invoice.total - invoice.creditNotes.reduce((sum, n) => sum + n.amount, 0)),
          invoice.currency
        ),
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
