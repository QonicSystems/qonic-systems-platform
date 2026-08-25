import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { formatMoney, toMinor } from "@/lib/money";
import { db } from "@/lib/db";
import { renderCreditNotePdf } from "@/lib/finance/invoice-pdf";
import { sendEmail } from "@/lib/notify";
import { nextReferenceFrom, referenceWhere } from "@/lib/reference";

export const runtime = "nodejs";

/** Sequential per year, e.g. QNC-CN-2026-0001 (prefix from lib/reference). */
async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  // Legacy-prefixed records are matched too, so the rename from AVX to
  // QNC continues the year's sequence instead of restarting it at 0001.
  const existing = await db.creditNote.findMany({
    where: { OR: referenceWhere("number", "CN", year) },
    select: { number: true },
  });
  return nextReferenceFrom(existing.map((row) => row.number), "CN", year);
}

/**
 * Issues a credit note — the correct instrument once an invoice has payments
 * against it and voiding is no longer allowed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      creditNotes: true,
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
  if (invoice.status === "DRAFT") return NextResponse.json({ message: "A draft invoice can simply be edited or voided." }, { status: 409 });
  if (invoice.status === "VOID") return NextResponse.json({ message: "That invoice is void." }, { status: 409 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const amount = toMinor(String(input.amount ?? ""));
  const reason = String(input.reason ?? "").trim();
  if (amount === null || Number.isNaN(amount) || amount <= 0) return NextResponse.json({ message: "Enter the amount to credit." }, { status: 422 });
  if (reason.length < 3) return NextResponse.json({ message: "Please give a reason for the credit note." }, { status: 422 });

  // Cumulative credits can never exceed what was invoiced.
  const alreadyCredited = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0);
  if (alreadyCredited + amount > invoice.total) {
    return NextResponse.json({
      message: `That would credit more than the invoice total. At most ${formatMoney(invoice.total - alreadyCredited, invoice.currency)} can still be credited.`,
    }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const note = await tx.creditNote.create({
      data: { number: await nextNumber(), invoiceId: id, amount, reason, issuedById: context.user.id },
    });
    // A fully credited invoice is settled: nothing further is collectable.
    if (alreadyCredited + amount >= invoice.total - invoice.paidAmount) {
      await tx.invoice.update({ where: { id }, data: { status: "PAID" } });
    }
    await recordAudit({ actorId: context.user.id, action: "invoice.credit_note", entityType: "Invoice", entityId: id, after: { number: note.number, amount, reason }, ipAddress: clientIp(request) }, tx);
    return note;
  });

  const recipient = ["QONIC_TO_VENDOR", "VENDOR_TO_GLOBAL_CANDIDATE"].includes(invoice.commercialKind)
    ? invoice.client.vendor?.email
    : invoice.commercialKind === "GLOBAL_CANDIDATE_COMMISSION_RECORD"
      ? invoice.client.globalCandidate?.email
      : invoice.client.contacts.find((contact) => contact.isPrimary)?.email ?? invoice.client.contacts.find((contact) => contact.email)?.email;

  let attachmentSent = false;
  let pdfPrepared = false;
  let pdfPreparationFailed = false;
  if (recipient) {
    try {
      const pdf = await renderCreditNotePdf({
        number: created.number, issuedAt: created.issuedAt, currency: invoice.currency,
        clientName: invoice.client.name, projectName: invoice.project?.name ?? null,
        invoiceNumber: invoice.number, invoiceIssueDate: invoice.issueDate,
        invoiceTotal: invoice.total, creditAmount: created.amount, reason: created.reason,
      });
      pdfPrepared = true;
      attachmentSent = await sendEmail(
        [recipient],
        `Credit note issued: ${created.number}`,
        `${created.number} for ${formatMoney(created.amount, invoice.currency)} is attached as a PDF. It adjusts invoice ${invoice.number}.`,
        "/invoices",
        [{ filename: `${created.number}.pdf`, content: pdf }]
      );
    } catch (error) {
      console.error(`Credit-note PDF email preparation failed for ${created.number}`, error);
      pdfPreparationFailed = true;
    }
  }

  return NextResponse.json({
    message: attachmentSent
      ? `${created.number} issued for ${formatMoney(amount, invoice.currency)} and its PDF email was sent to ${recipient}.`
      : pdfPrepared
        ? `${created.number} issued for ${formatMoney(amount, invoice.currency)} and its PDF was prepared, but email delivery could not be completed.`
      : pdfPreparationFailed
        ? `${created.number} issued for ${formatMoney(amount, invoice.currency)}, but its PDF could not be prepared for email. Download it from Invoices and try again.`
        : `${created.number} issued for ${formatMoney(amount, invoice.currency)}. Add a billing email before sending the PDF.`,
    id: created.id,
  });
}
