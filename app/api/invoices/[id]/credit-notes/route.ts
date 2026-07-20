import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { formatMoney, toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AVX-CN-${year}-`;
  const latest = await db.creditNote.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  return `${prefix}${String(latest ? Number(latest.number.slice(prefix.length)) + 1 : 1).padStart(4, "0")}`;
}

/**
 * Issues a credit note — the correct instrument once an invoice has payments
 * against it and voiding is no longer allowed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id }, include: { creditNotes: true } });
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

  return NextResponse.json({ message: `${created.number} issued for ${formatMoney(amount, invoice.currency)}.`, id: created.id });
}
