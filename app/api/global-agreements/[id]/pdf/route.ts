import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { renderGlobalCandidateAgreementPdf } from "@/lib/global-agreements/pdf";
import type { GlobalCandidateAgreementPayload } from "@/lib/global-agreements/payload";

export const runtime = "nodejs";

/** Renders the immutable snapshot that was sent, never the live candidate profile. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.view");
  if (response) return response;

  const { id } = await params;
  const agreement = await db.globalCandidateAgreement.findUnique({ where: { id } });
  if (!agreement) return NextResponse.json({ message: "That Global Candidate agreement could not be found." }, { status: 404 });

  await recordAudit({
    actorId: context.user.id,
    action: "global_agreement.download",
    entityType: "GlobalCandidateAgreement",
    entityId: agreement.id,
    after: { reference: agreement.reference },
    ipAddress: clientIp(request),
  });

  try {
    const buffer = await renderGlobalCandidateAgreementPdf({
      reference: agreement.reference,
      issuedAt: agreement.releasedAt ?? agreement.createdAt,
      payload: agreement.payload as unknown as GlobalCandidateAgreementPayload,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${agreement.reference}.pdf"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Global Candidate agreement PDF render failed", error);
    return NextResponse.json({ message: "The agreement PDF could not be produced." }, { status: 502 });
  }
}
