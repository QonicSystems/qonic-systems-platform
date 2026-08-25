import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/guard";
import { companyAnnouncementAudienceWhere } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Read the caller's own outstanding mandatory notices. The gate polls this
 * lightweight route after navigation/focus, so a newly released announcement
 * reaches already-signed-in people without relying on stale layout state.
 */
export async function GET() {
  const { context, response } = await guardRoute();
  if (response) return response;

  const items = await db.companyAnnouncementRecipient.findMany({
    where: {
      userId: context.user.id,
      acknowledgedAt: null,
      user: companyAnnouncementAudienceWhere,
      announcement: { status: "RELEASED" },
    },
    orderBy: { announcement: { releasedAt: "asc" } },
    select: {
      announcement: {
        select: {
          id: true,
          title: true,
          message: true,
          releasedAt: true,
          releasedBy: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    items: items.map(({ announcement }) => ({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      releasedAt: announcement.releasedAt.toISOString(),
      releasedBy: announcement.releasedBy.name,
    })),
  });
}
