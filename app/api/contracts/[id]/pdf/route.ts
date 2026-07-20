import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { renderLetterPdf } from "@/lib/contracts/pdf";
import type { ContractPayload } from "@/lib/contracts/payload";
import { canViewLetter } from "@/lib/contracts/workflow";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Renders the letter on demand. Nothing is stored — the document is produced
 * from the frozen `payload`, the versioned `templateKey`, and the release
 * metadata, every time it is requested.
 *
 * What keeps an issued letter stable is that its inputs are immutable: editing
 * is blocked once the letter leaves DRAFT/CHANGES_REQUESTED. The one rule that
 * must be respected is that a template's wording is never edited in place —
 * changes ship as a new `templateKey` (…-v2), or previously issued letters
 * would silently re-render with new wording.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const letter = await db.contractLetter.findUnique({
    where: { id },
    include: { subject: true, releasedBy: true },
  });
  if (!letter || !canViewLetter(context, letter)) {
    return NextResponse.json({ message: "That contract letter could not be found." }, { status: 404 });
  }

  if (!letter.releasedAt) {
    return NextResponse.json({ message: "This letter has not been released yet." }, { status: 409 });
  }

  await recordAudit({
    actorId: context.user.id,
    action: "contract.download",
    entityType: "ContractLetter",
    entityId: letter.id,
    after: { reference: letter.reference },
    ipAddress: clientIp(request),
  });

  try {
    const buffer = await renderLetterPdf(letter.templateKey, {
      reference: letter.reference,
      subjectName: letter.subject.name,
      subjectEmail: letter.subject.email,
      payload: letter.payload as unknown as ContractPayload,
      releasedByName: letter.releasedBy?.name ?? "Avenstrix Consulting",
      releasedAt: letter.releasedAt,
      revokedAt: letter.revokedAt,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${letter.reference}.pdf"`,
        "Content-Length": String(buffer.byteLength),
        // A contract letter must never sit in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Contract PDF render failed", error);
    return NextResponse.json({ message: "The letter could not be produced." }, { status: 502 });
  }
}
