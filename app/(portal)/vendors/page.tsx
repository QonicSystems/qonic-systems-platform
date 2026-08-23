import { VendorDashboard } from "@/components/finance/vendor-dashboard";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Vendor Dashboard" };

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${normalized}%`;
}

export default async function VendorsPage() {
  const context = await requirePermission("client.view");
  const [vendors, policy] = await Promise.all([
    db.vendor.findMany({
      include: {
        clients: {
          include: {
            globalCandidate: { select: { name: true } },
            projects: { select: { name: true, code: true } },
            invoices: {
              where: { commercialKind: { in: ["STANDARD", "QONIC_TO_VENDOR"] } },
              select: { id: true, total: true, paidAmount: true, status: true },
            },
          },
          orderBy: { name: "asc" },
        },
        reminders: { take: 10, orderBy: { sentAt: "desc" }, include: { sentBy: { select: { name: true } } } },
        _count: { select: { reminders: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.commissionPolicy.findUnique({ where: { id: "default" } }),
  ]);

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Commercial Operations</p>
      <h1 className="portal-title">Vendor Dashboard</h1>
      <p className="portal-lead">Vendor contacts, procured jobs, C2C commissions, receivables, and reminder history in one place.</p>
    </header>
    <VendorDashboard
      vendors={vendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        contactName: vendor.contactName ?? "",
        email: vendor.email ?? "",
        phone: vendor.phone ?? "",
        address: vendor.address ?? "",
        website: vendor.website ?? "",
        status: vendor.status,
        notes: vendor.notes ?? "",
        reminderCount: vendor._count.reminders,
        reminders: vendor.reminders.map((reminder) => ({
          id: reminder.id,
          channel: reminder.channel,
          recipient: reminder.recipient,
          message: reminder.message,
          sentAt: reminder.sentAt.toISOString(),
          sentBy: reminder.sentBy?.name ?? "System",
        })),
        jobs: vendor.clients.map((client) => {
          const invoiceAmount = client.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
          const paidAmount = client.invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0);
          const outstanding = invoiceAmount - paidAmount;
          const statuses = new Set(client.invoices.map((invoice) => invoice.status));
          const paymentStatus = statuses.size === 0 ? "Not invoiced" : outstanding === 0 && invoiceAmount > 0 ? "Paid" : statuses.has("OVERDUE") ? "Overdue" : paidAmount > 0 ? "Part paid" : "Outstanding";
          return {
            id: client.id,
            client: client.name,
            candidate: client.globalCandidate?.name ?? "—",
            projects: client.projects.map((project) => `${project.name} (${project.code})`).join(", ") || "—",
            employmentType: client.employmentType ?? "—",
            workArrangement: client.workArrangement ?? "—",
            startDate: client.startDate?.toISOString().slice(0, 10) ?? "—",
            endDate: client.endDate?.toISOString().slice(0, 10) ?? "—",
            clientRate: client.actualClientRate === null ? "—" : `${formatMoney(client.actualClientRate, client.rateCurrency)}/hr`,
            commission: client.employmentType === "C2C" ? {
              vendor: `Vendor ${formatPercent(client.vendorCommissionPercent)}`,
              candidate: `Global Candidate ${formatPercent(client.globalCandidateCommissionPercent)}`,
            } : null,
            invoiceAmount: formatMoney(invoiceAmount, client.rateCurrency),
            amountPaid: formatMoney(paidAmount, client.rateCurrency),
            outstanding: formatMoney(outstanding, client.rateCurrency),
            paymentStatus,
          };
        }),
      }))}
      defaultGlobalCandidateCommissionPercent={policy?.defaultGlobalCandidateCommissionPercent ?? 20}
      defaultVendorCommissionPercent={policy?.defaultVendorCommissionPercent ?? 20}
      canManage={can(context, "client.manage")}
    />
  </div>;
}
