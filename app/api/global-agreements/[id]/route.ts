import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { notifyLeadership, sendEmail } from "@/lib/notify";

export const runtime = "nodejs";

/** Withdraws an issued master agreement so a corrected replacement may be sent. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("contract.revoke");
  if (response) return response;
  const { id } = await params;
  const agreement = await db.globalCandidateAgreement.findUnique({
    where: { id },
    include: { candidate: { select: { name: true } } },
  });
  if (!agreement) return NextResponse.json({ message: "That Global Candidate agreement could not be found." }, { status: 404 });
  if (!["SENT", "ACKNOWLEDGED"].includes(agreement.status)) {
    return NextResponse.json({ message: "Only a sent or acknowledged agreement can be revoked." }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.globalCandidateAgreement.update({
      where: { id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: context.user.id,
        // Invalidate the public response link immediately. The hash is the
        // only stored token material, so clearing it makes it irrecoverable.
        acknowledgementTokenHash: null,
      },
    });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: `Global Candidate agreement revoked: ${agreement.candidate.name}`,
      body: `${agreement.reference} was revoked by ${context.user.name}. A corrected master agreement may now be issued.`,
      link: "/candidates",
    }, tx);
    await recordAudit({
      actorId: context.user.id,
      action: "global_agreement.revoke",
      entityType: "GlobalCandidateAgreement",
      entityId: agreement.id,
      before: { status: agreement.status },
      after: { status: "REVOKED", reference: agreement.reference },
      ipAddress: clientIp(request),
    }, tx);
  });
  void sendEmail(
    [agreement.recipientEmail],
    `Global Candidate agreement revoked: ${agreement.reference}`,
    "QONIC consulting has withdrawn this master agreement. Please do not rely on it for future representation. If replacement terms are required, they will be sent as a new agreement with a new PDF attachment.",
    null,
  );
  return NextResponse.json({ message: `${agreement.reference} was revoked. You can now issue a replacement.` });
}
