import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Renders the invoice on demand from the stored figures. Nothing is stored. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.view");
  if (response) return response;

  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { client: true, project: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ message: "That invoice could not be found." }, { status: 404 });

  await recordAudit({ actorId: context.user.id, action: "invoice.download", entityType: "Invoice", entityId: id, after: { number: invoice.number }, ipAddress: clientIp(request) });

  try {
    const buffer = await renderInvoicePdf({
      number: invoice.number, status: invoice.status,
      issueDate: invoice.issueDate, dueDate: invoice.dueDate, currency: invoice.currency,
      clientName: invoice.client.name, projectName: invoice.project?.name ?? null,
      lines: invoice.lines, subtotal: invoice.subtotal, taxPercent: invoice.taxPercent,
      taxAmount: invoice.taxAmount, total: invoice.total, paidAmount: invoice.paidAmount,
      notes: invoice.notes,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF render failed", error);
    return NextResponse.json({ message: "The invoice could not be produced." }, { status: 502 });
  }
}
