import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { renderCreditNotePdf } from "@/lib/finance/invoice-pdf";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Renders the immutable correction details recorded against the invoice. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("invoice.view");
  if (response) return response;

  const { id } = await params;
  const note = await db.creditNote.findUnique({
    where: { id },
    include: {
      invoice: {
        include: {
          client: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!note) return NextResponse.json({ message: "That credit note could not be found." }, { status: 404 });

  try {
    const buffer = await renderCreditNotePdf({
      number: note.number, issuedAt: note.issuedAt, currency: note.invoice.currency,
      clientName: note.invoice.client.name, projectName: note.invoice.project?.name ?? null,
      invoiceNumber: note.invoice.number, invoiceIssueDate: note.invoice.issueDate,
      invoiceTotal: note.invoice.total, creditAmount: note.amount, reason: note.reason,
    });
    await recordAudit({
      actorId: context.user.id, action: "credit_note.download", entityType: "CreditNote", entityId: note.id,
      after: { number: note.number, invoiceNumber: note.invoice.number }, ipAddress: clientIp(request),
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${note.number}.pdf"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Credit-note PDF render failed", error);
    return NextResponse.json({ message: "The credit note could not be produced." }, { status: 502 });
  }
}
