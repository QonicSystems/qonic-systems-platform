import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { companyAnnouncementAudienceWhere, mayPublishCompanyAnnouncements, parseCompanyAnnouncement } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Release a mandatory company announcement. Only active accounts deliberately
 * added through People receive it: the CEO and every Candidate-Pool account
 * (Developers and Global Candidates) are excluded. The recipient snapshot is
 * created in the same transaction as the announcement.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("announcement.publish");
  if (response) return response;
  if (!mayPublishCompanyAnnouncements(context.role)) {
    return NextResponse.json({ message: "Only the current CEO can release a company announcement." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ message: "Please submit a valid announcement." }, { status: 400 });
  }
  const parsed = parseCompanyAnnouncement(body);
  if (!parsed.data) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: parsed.errors }, { status: 422 });
  }
  // Keep the narrowed value outside the transaction callback. TypeScript does
  // not carry a property narrowing into a closure because the object could be
  // mutated before that callback runs.
  const announcementData = parsed.data;

  const released = await db.$transaction(async (tx) => {
    const recipients = await tx.user.findMany({
      where: companyAnnouncementAudienceWhere,
      select: { id: true },
    });
    const announcement = await tx.companyAnnouncement.create({
      data: {
        title: announcementData.title,
        message: announcementData.message,
        releasedById: context.user.id,
      },
      select: { id: true, releasedAt: true },
    });
    await tx.companyAnnouncementRecipient.createMany({
      data: recipients.map((recipient) => ({ announcementId: announcement.id, userId: recipient.id })),
    });
    await recordAudit({
      actorId: context.user.id,
      action: "company_announcement.release",
      entityType: "CompanyAnnouncement",
      entityId: announcement.id,
      after: { title: announcementData.title, recipientCount: recipients.length },
      ipAddress: clientIp(request),
    }, tx);
    return { ...announcement, recipientCount: recipients.length };
  });

  return NextResponse.json({
    message: `Announcement released to ${released.recipientCount} active ${released.recipientCount === 1 ? "person" : "people"}.`,
    announcement: { id: released.id, releasedAt: released.releasedAt.toISOString(), recipientCount: released.recipientCount },
  }, { status: 201 });
}
