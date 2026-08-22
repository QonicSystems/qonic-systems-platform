import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Issue or void an invoice. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id }, include: { payments: true } });
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
    return NextResponse.json({ message: `${invoice.number} issued.` });
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
