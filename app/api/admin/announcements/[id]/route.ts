import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { mayPublishCompanyAnnouncements } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Delete only a fully-read announcement; unread releases must be revoked instead. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("announcement.publish");
  if (response) return response;
  if (!mayPublishCompanyAnnouncements(context.role)) {
    return NextResponse.json({ message: "Only the current CEO can delete a company announcement." }, { status: 403 });
  }

  const { id } = await params;
  const result = await db.$transaction(async (tx) => {
    const announcement = await tx.companyAnnouncement.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    });
    if (!announcement) return { kind: "missing" as const };
    if (announcement.status !== "RELEASED") return { kind: "revoked" as const };

    const outstanding = await tx.companyAnnouncementRecipient.count({ where: { announcementId: id, acknowledgedAt: null } });
    if (outstanding > 0) return { kind: "unread" as const, outstanding };

    await tx.companyAnnouncement.delete({ where: { id } });
    await recordAudit({
      actorId: context.user.id,
      action: "company_announcement.delete",
      entityType: "CompanyAnnouncement",
      entityId: id,
      before: { title: announcement.title, status: announcement.status, allRecipientsAcknowledged: true },
      ipAddress: clientIp(request),
    }, tx);
    return { kind: "deleted" as const, title: announcement.title };
  });

  if (result.kind === "missing") return NextResponse.json({ message: "That announcement no longer exists." }, { status: 404 });
  if (result.kind === "revoked") return NextResponse.json({ message: "Revoked announcements are retained as an auditable record and cannot be deleted." }, { status: 409 });
  if (result.kind === "unread") return NextResponse.json({ message: `${result.outstanding} recipient${result.outstanding === 1 ? " is" : "s are"} still waiting. Revoke this announcement instead.` }, { status: 409 });
  return NextResponse.json({ message: `“${result.title}” was deleted. Its acknowledgement receipts were removed, while the audit record remains.` });
}
