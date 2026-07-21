import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Escapes a CSV field.
 *
 * A leading =, +, -, or @ is prefixed with a quote: spreadsheets treat those as
 * formulas, so an unescaped value could execute when the file is opened. This
 * is CSV injection and it is a real risk on an export a finance team will open.
 */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsv(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
}

const money = (minor: number) => (minor / 100).toFixed(2);
const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? "";

/** CSV extracts for an accountant. `?type=invoices|payments|expenses|time|audit` */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "invoices";

  // The audit export is a compliance artefact, so it sits behind its own right.
  const permission = type === "audit" ? "audit.view" : "report.finance";
  const { context, response } = await guardRoute(permission);
  if (response) return response;

  let filename = `qonic-${type}.csv`;
  let csv = "";

  if (type === "invoices") {
    const invoices = await db.invoice.findMany({ include: { client: true, project: true, creditNotes: true }, orderBy: { issueDate: "asc" } });
    csv = toCsv(
      ["Number", "Status", "Client", "Project", "Issued", "Due", "Currency", "Subtotal", "Tax", "Total", "Paid", "Credited", "Outstanding"],
      invoices.map((invoice) => {
        const credited = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0);
        return [
          invoice.number, invoice.status, invoice.client.name, invoice.project?.name ?? "",
          day(invoice.issueDate), day(invoice.dueDate), invoice.currency,
          money(invoice.subtotal), money(invoice.taxAmount), money(invoice.total),
          money(invoice.paidAmount), money(credited), money(invoice.total - invoice.paidAmount - credited),
        ];
      }),
    );
  } else if (type === "payments") {
    const payments = await db.payment.findMany({ include: { invoice: { include: { client: true } } }, orderBy: { paidOn: "asc" } });
    csv = toCsv(
      ["Invoice", "Client", "Received", "Amount", "Method", "Reference"],
      payments.map((payment) => [payment.invoice.number, payment.invoice.client.name, day(payment.paidOn), money(payment.amount), payment.method, payment.reference ?? ""]),
    );
  } else if (type === "expenses") {
    const expenses = await db.expense.findMany({ include: { user: true, project: true }, orderBy: { spentOn: "asc" } });
    csv = toCsv(
      ["Date", "Claimant", "Category", "Description", "Project", "Amount", "Currency", "Billable", "Status", "Reimbursed"],
      expenses.map((expense) => [
        day(expense.spentOn), expense.user.name, expense.category, expense.description,
        expense.project?.name ?? "", money(expense.amount), expense.currency,
        expense.billable ? "Yes" : "No", expense.status, day(expense.reimbursedAt),
      ]),
    );
  } else if (type === "time") {
    const entries = await db.timeEntry.findMany({
      where: { timesheet: { status: "APPROVED" } },
      include: { timesheet: { include: { user: true } }, project: { include: { client: true } }, task: true },
      orderBy: { workDate: "asc" },
    });
    csv = toCsv(
      ["Date", "Person", "Client", "Project", "Task", "Hours", "Billable", "Invoiced"],
      entries.map((entry) => [
        day(entry.workDate), entry.timesheet.user.name, entry.project.client.name, entry.project.name,
        entry.task?.name ?? "", (entry.minutes / 60).toFixed(2), entry.billable ? "Yes" : "No", day(entry.invoicedAt),
      ]),
    );
  } else if (type === "audit") {
    const logs = await db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "asc" }, take: 10_000 });
    csv = toCsv(
      ["When", "Actor", "Action", "Entity", "EntityId", "Before", "After", "IP"],
      logs.map((log) => [
        log.createdAt.toISOString(), log.actor?.name ?? "system", log.action, log.entityType, log.entityId ?? "",
        log.before ? JSON.stringify(log.before) : "", log.after ? JSON.stringify(log.after) : "", log.ipAddress ?? "",
      ]),
    );
  } else {
    return NextResponse.json({ message: "Unknown export type." }, { status: 400 });
  }

  await recordAudit({ actorId: context.user.id, action: "data.export", entityType: "Export", entityId: type, ipAddress: clientIp(request) });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
