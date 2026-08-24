import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/notify";

export const runtime = "nodejs";

type InvoiceDocumentForEmail = {
  number: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  settlementCurrency: string | null;
  lockedSettlementRate: number | null;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  notes: string | null;
  commercialKind: string;
  client: {
    name: string;
    contacts: Array<{ email: string | null; isPrimary: boolean }>;
    vendor: { email: string | null } | null;
    globalCandidate: { email: string } | null;
  };
  project: { name: string } | null;
  lines: Array<{ description: string; quantity: number; unitRate: number; amount: number }>;
};

function deliveryRecipient(invoice: InvoiceDocumentForEmail): string | null {
  if (["QONIC_TO_VENDOR", "VENDOR_TO_GLOBAL_CANDIDATE"].includes(invoice.commercialKind)) return invoice.client.vendor?.email ?? null;
  if (invoice.commercialKind === "GLOBAL_CANDIDATE_COMMISSION_RECORD") return invoice.client.globalCandidate?.email ?? null;
  return invoice.client.contacts.find((contact) => contact.isPrimary)?.email
    ?? invoice.client.contacts.find((contact) => contact.email)?.email
    ?? null;
}

type EmailDeliveryResult = { recipient: string | null; pdfPrepared: boolean; emailSent: boolean };

async function emailInvoicePdf(invoice: InvoiceDocumentForEmail, event: "issued" | "reissued"): Promise<EmailDeliveryResult> {
  const recipient = deliveryRecipient(invoice);
  if (!recipient) return { recipient: null, pdfPrepared: false, emailSent: false };

  try {
    const pdf = await renderInvoicePdf({
      number: invoice.number, status: invoice.status,
      issueDate: invoice.issueDate, dueDate: invoice.dueDate, currency: invoice.currency,
      settlementCurrency: invoice.settlementCurrency, lockedSettlementRate: invoice.lockedSettlementRate,
      clientName: invoice.client.name, projectName: invoice.project?.name ?? null,
      lines: invoice.lines, subtotal: invoice.subtotal, taxPercent: invoice.taxPercent,
      taxAmount: invoice.taxAmount, total: invoice.total, paidAmount: invoice.paidAmount,
      notes: invoice.notes,
    });
    const emailSent = await sendEmail(
      [recipient],
      `${event === "issued" ? "Invoice issued" : "Invoice reissued"}: ${invoice.number}`,
      `${invoice.number} for ${formatMoney(invoice.total, invoice.currency)} is attached as a PDF.${event === "issued" ? ` Payment is due ${invoice.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.` : ""}`,
      "/invoices",
      [{ filename: `${invoice.number}.pdf`, content: pdf }]
    );
    return { recipient, pdfPrepared: true, emailSent };
  } catch (error) {
    console.error(`Invoice PDF email preparation failed for ${invoice.number}`, error);
    return { recipient, pdfPrepared: false, emailSent: false };
  }
}

/** Issue or void an invoice. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      payments: true,
      lines: { orderBy: { sortOrder: "asc" } },
      project: { select: { name: true } },
      client: {
        include: {
          contacts: { where: { email: { not: null } }, orderBy: { isPrimary: "desc" }, select: { email: true, isPrimary: true } },
          vendor: { select: { email: true } },
          globalCandidate: { select: { email: true } },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ message: "That invoice could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const action = String(input.action ?? "");

  if (action === "send") {
    if (invoice.status !== "DRAFT") return NextResponse.json({ message: "Only a draft invoice can be issued." }, { status: 409 });
    if (invoice.total <= 0) return NextResponse.json({ message: "An invoice must have a value before it is issued." }, { status: 409 });
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
      await recordAudit({ actorId: context.user.id, action: "invoice.send", entityType: "Invoice", entityId: id, after: { number: invoice.number, total: invoice.total }, ipAddress: clientIp(request) }, tx);
    });
    const delivery = await emailInvoicePdf({ ...invoice, status: "SENT", lockedSettlementRate: invoice.lockedSettlementRate === null ? null : Number(invoice.lockedSettlementRate) }, "issued");
    return NextResponse.json({
      message: delivery.emailSent
        ? `${invoice.number} issued and its PDF email was sent to ${delivery.recipient}.`
        : delivery.pdfPrepared
          ? `${invoice.number} issued and its PDF was prepared, but email delivery could not be completed. Download it from Invoices and try Reissue again.`
          : delivery.recipient
            ? `${invoice.number} issued, but its PDF could not be prepared for email. Download it from Invoices and try Reissue again.`
          : `${invoice.number} issued. Add a billing email to the client before reissuing it.`,
    });
  }

  if (action === "reissue") {
    if (!["SENT", "PART_PAID", "OVERDUE"].includes(invoice.status)) {
      return NextResponse.json({ message: "Only an unpaid issued invoice can be reissued." }, { status: 409 });
    }
    const delivery = await emailInvoicePdf({ ...invoice, lockedSettlementRate: invoice.lockedSettlementRate === null ? null : Number(invoice.lockedSettlementRate) }, "reissued");
    await recordAudit({
      actorId: context.user.id, action: "invoice.reissue", entityType: "Invoice", entityId: id,
      after: { number: invoice.number, status: invoice.status, recipient: delivery.recipient, pdfPrepared: delivery.pdfPrepared, emailSent: delivery.emailSent }, ipAddress: clientIp(request),
    });
    return NextResponse.json({
      message: delivery.emailSent
        ? `${invoice.number} was reissued and its PDF email was sent to ${delivery.recipient}.`
        : delivery.pdfPrepared
          ? `The PDF for ${invoice.number} was prepared, but email delivery could not be completed. Download it from Invoices and try Reissue again.`
          : delivery.recipient
            ? `The PDF for ${invoice.number} could not be prepared for email. Download it from Invoices and try Reissue again.`
          : `No billing email is recorded for ${invoice.number}. Add one before reissuing it.`,
    });
  }

  if (action === "void") {
    if (invoice.status === "VOID") return NextResponse.json({ message: "That invoice is already void." }, { status: 409 });
    // Voiding an invoice that has money against it would leave the payment
    // orphaned and the ledger wrong.
    if (invoice.payments.length > 0) {
      return NextResponse.json({ message: "This invoice has payments recorded against it and cannot be voided. Raise a credit note instead." }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date() } });
      // Release the hours so they can be billed on a corrected invoice.
      await tx.timeEntry.updateMany({ where: { invoiceId: id }, data: { invoicedAt: null, invoiceId: null } });
      await recordAudit({ actorId: context.user.id, action: "invoice.void", entityType: "Invoice", entityId: id, before: { status: invoice.status }, ipAddress: clientIp(request) }, tx);
    });
    return NextResponse.json({ message: `${invoice.number} voided and its time released for re-invoicing.` });
  }

  return NextResponse.json({ message: "That is not a valid action." }, { status: 400 });
}

/** Permanently remove an invoice. Only a draft or already-voided invoice qualifies. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id }, include: { payments: true, creditNotes: true } });
  if (!invoice) return NextResponse.json({ message: "That invoice could not be found." }, { status: 404 });

  // A SENT/PART_PAID/OVERDUE/PAID invoice is a live financial claim — it must
  // be Voided first (which itself refuses once a payment exists) before it can
  // be deleted, never removed in one step. DRAFT and VOID are the only two
  // states the UI already guarantees are payment- and credit-note-free, but
  // both are re-checked here rather than trusted, since nothing in the schema
  // stops a payment or credit note from being recorded against either.
  if (!["DRAFT", "VOID"].includes(invoice.status)) {
    return NextResponse.json({ message: "Only a draft or voided invoice can be deleted. Void it first." }, { status: 409 });
  }
  if (invoice.payments.length > 0) {
    return NextResponse.json({ message: "This invoice has payments recorded against it and cannot be deleted." }, { status: 409 });
  }
  if (invoice.creditNotes.length > 0) {
    return NextResponse.json({ message: "This invoice has credit notes on record and cannot be deleted." }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    // Voiding already does this, but a DRAFT invoice raised from timesheets
    // never went through Void — its hours would otherwise stay stamped
    // "invoiced" against a row that no longer exists, permanently unbillable.
    await tx.timeEntry.updateMany({ where: { invoiceId: id }, data: { invoicedAt: null, invoiceId: null } });
    await recordAudit({
      actorId: context.user.id, action: "invoice.delete", entityType: "Invoice", entityId: id,
      before: { number: invoice.number, status: invoice.status, total: invoice.total }, ipAddress: clientIp(request),
    }, tx);
    await tx.invoice.delete({ where: { id } });
  });

  return NextResponse.json({ message: `${invoice.number} deleted.` });
}
