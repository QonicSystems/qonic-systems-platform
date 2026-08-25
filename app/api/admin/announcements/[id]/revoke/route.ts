import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { mayPublishCompanyAnnouncements } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Stop a live announcement gate while retaining the release and read record. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("announcement.publish");
  if (response) return response;
  if (!mayPublishCompanyAnnouncements(context.role)) {
    return NextResponse.json({ message: "Only the current CEO can revoke a company announcement." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.companyAnnouncement.findUnique({ where: { id }, select: { id: true, title: true, status: true } });
  if (!existing) return NextResponse.json({ message: "That announcement no longer exists." }, { status: 404 });
  if (existing.status === "REVOKED") return NextResponse.json({ message: "This announcement has already been revoked." }, { status: 409 });

  const revokedAt = new Date();
  const revoked = await db.$transaction(async (tx) => {
    // Keep this conditional in the write so two CEO browser tabs cannot both
    // report a successful revocation and produce duplicate audit events.
    const changed = await tx.companyAnnouncement.updateMany({
      where: { id, status: "RELEASED" },
      data: { status: "REVOKED", revokedAt, revokedById: context.user.id },
    });
    if (changed.count === 0) return false;
    await recordAudit({
      actorId: context.user.id,
      action: "company_announcement.revoke",
      entityType: "CompanyAnnouncement",
      entityId: id,
      before: { status: "RELEASED" },
      after: { status: "REVOKED", title: existing.title, revokedAt: revokedAt.toISOString() },
      ipAddress: clientIp(request),
    }, tx);
    return true;
  });

  if (!revoked) return NextResponse.json({ message: "This announcement was already revoked or removed." }, { status: 409 });
  return NextResponse.json({ message: "Announcement revoked. It will no longer block recipients, and its acknowledgement record has been retained." });
}
