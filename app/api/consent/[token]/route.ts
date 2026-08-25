import { NextResponse } from "next/server";
import { clientIp } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Records an explicit response from the one-time link emailed to a candidate. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    return NextResponse.json({ message: "This consent link is invalid." }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid response." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (typeof input.confirm !== "boolean") {
    return NextResponse.json({ message: "Please choose whether you consent." }, { status: 422 });
  }

  const consent = await db.candidateConsent.findUnique({
    where: { tokenHash: sha256(token) },
    include: { candidate: { select: { id: true, name: true, consentStatus: true } } },
  });
  if (!consent) return NextResponse.json({ message: "This consent link is invalid or has expired." }, { status: 404 });
  if (consent.status !== "PENDING") {
    return NextResponse.json({
      message: consent.status === "CONSENTED"
        ? "Your consent has already been recorded. Thank you."
        : "Your response has already been recorded.",
      status: consent.status,
    });
  }

  const status = input.confirm ? "CONSENTED" : "DECLINED";
  await db.$transaction(async (tx) => {
    await tx.candidateConsent.update({
      where: { id: consent.id },
      data: { status, respondedAt: new Date(), ipAddress: clientIp(request) },
    });
    await tx.candidate.update({
      where: { id: consent.candidateId },
      data: { consentStatus: status, consentAt: input.confirm ? new Date() : null },
    });
    await notifyLeadership({
      kind: "RECRUITMENT",
      title: `Global Candidate consent ${input.confirm ? "confirmed" : "declined"}: ${consent.candidate.name}`,
      body: input.confirm
        ? `${consent.candidate.name} has confirmed Qonic Systems may market their profile.`
        : `${consent.candidate.name} declined profile-marketing consent.`,
      link: "/candidates",
    }, tx);
  });

  return NextResponse.json({
    message: input.confirm
      ? "Thank you. Qonic Systems can now market your profile and will notify you if a job is procured."
      : "Your choice has been recorded. Qonic Systems will not market your profile.",
    status,
  });
}
