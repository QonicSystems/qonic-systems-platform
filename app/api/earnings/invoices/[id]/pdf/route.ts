import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/guard";
import { guardRoute } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { renderEarningInvoicePdf } from "@/lib/finance/earning-invoice-pdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;
  const { id } = await params;
  const invoice = await db.earningInvoice.findUnique({ where: { id }, include: { user: true } });
  if (!invoice) return NextResponse.json({ message: "That earnings invoice could not be found." }, { status: 404 });
  const founderFinance = context.role.isSuperAdmin || context.role.key === ROLE.CO_FOUNDER;
  if (invoice.userId !== context.user.id && !(founderFinance && can(context, "compensation.manage"))) {
    return NextResponse.json({ message: "You do not have access to that earnings invoice." }, { status: 403 });
  }

  await recordAudit({ actorId: context.user.id, action: "earning_invoice.download", entityType: "EarningInvoice", entityId: invoice.id, after: { reference: invoice.reference }, ipAddress: clientIp(request) });
  try {
    const pdf = await renderEarningInvoicePdf({
      reference: invoice.reference, payeeName: invoice.user.name, payeeEmail: invoice.user.email,
      period: invoice.period, submittedAt: invoice.submittedAt, currency: invoice.currency,
      amount: invoice.amount, source: invoice.source, status: invoice.status, notes: invoice.notes,
      paidAt: invoice.paidAt, paymentReference: invoice.paymentReference,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.reference}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Earnings invoice PDF render failed", error);
    return NextResponse.json({ message: "The earnings invoice PDF could not be produced." }, { status: 502 });
  }
}
