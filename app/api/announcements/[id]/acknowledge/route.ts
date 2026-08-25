import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Acknowledge only the caller's own receipt; announcement ids never grant access to another person's receipt. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;
  const { id } = await params;

  const acknowledged = await db.$transaction(async (tx) => {
    const result = await tx.companyAnnouncementRecipient.updateMany({
      // A stale modal may outlive a CEO revocation by a few seconds. A revoked
      // notice is no longer an obligation, so it cannot create a fresh read
      // acknowledgement after that point.
      where: { announcementId: id, userId: context.user.id, acknowledgedAt: null, announcement: { status: "RELEASED" } },
      data: { acknowledgedAt: new Date() },
    });
    if (result.count > 0) {
      await recordAudit({
        actorId: context.user.id,
        action: "company_announcement.acknowledge",
        entityType: "CompanyAnnouncement",
        entityId: id,
        after: { acknowledged: true },
        ipAddress: clientIp(request),
      }, tx);
    }
    return result.count > 0;
  });

  // Treat an already-acknowledged notice as a success. This keeps a retry after
  // a dropped response idempotent without exposing whether someone else holds a
  // recipient record for the supplied id.
  return NextResponse.json({ message: acknowledged ? "Acknowledged." : "Already acknowledged or no longer required." });
}
