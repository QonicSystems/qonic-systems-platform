import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { notifyLeadership } from "@/lib/notify";

export const runtime = "nodejs";

/** Records a Global Candidate's one-time master-agreement response. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    return NextResponse.json({ message: "This agreement link is invalid." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid response." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (typeof input.confirm !== "boolean") {
    return NextResponse.json({ message: "Please choose whether you accept the agreement." }, { status: 422 });
  }

  const agreement = await db.globalCandidateAgreement.findUnique({
    where: { acknowledgementTokenHash: sha256(token) },
    include: { candidate: { select: { name: true } } },
  });
  if (!agreement) return NextResponse.json({ message: "This agreement link is invalid or has expired." }, { status: 404 });
  if (agreement.acknowledgementExpiresAt && agreement.acknowledgementExpiresAt <= new Date()) {
    return NextResponse.json({ message: "This agreement link has expired. Please ask Qonic consulting for a new agreement." }, { status: 410 });
  }
  if (agreement.status !== "SENT") {
    return NextResponse.json({
      message: agreement.status === "ACKNOWLEDGED"
        ? "Your acceptance has already been recorded. Thank you."
        : "This agreement is no longer open for a response.",
      status: agreement.status,
    }, { status: 409 });
  }

  const status = input.confirm ? "ACKNOWLEDGED" : "DECLINED";
  const respondedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.globalCandidateAgreement.update({
      where: { id: agreement.id },
      data: { status, acknowledgedAt: respondedAt, responseIp: clientIp(request), acknowledgementTokenHash: null },
    });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: `Global Candidate agreement ${input.confirm ? "accepted" : "declined"}: ${agreement.candidate.name}`,
      body: `${agreement.reference} was ${input.confirm ? "accepted" : "declined"} by the candidate.`,
      link: "/candidates",
    }, tx);
    await recordAudit({
      actorId: null,
      action: `global_agreement.${input.confirm ? "acknowledged" : "declined"}`,
      entityType: "GlobalCandidateAgreement",
      entityId: agreement.id,
      before: { status: agreement.status },
      after: { status, reference: agreement.reference },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: input.confirm
      ? "Thank you. Your agreement acceptance has been recorded."
      : "Your response has been recorded. Qonic consulting will not use this agreement for representation.",
    status,
  });
}
