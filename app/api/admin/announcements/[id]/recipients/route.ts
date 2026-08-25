import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/guard";
import { mayPublishCompanyAnnouncements } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

/** CEO-only, paginated acknowledgement detail for one announcement. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("announcement.publish");
  if (response) return response;
  if (!mayPublishCompanyAnnouncements(context.role)) {
    return NextResponse.json({ message: "Only the current CEO can view announcement acknowledgements." }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "OUTSTANDING";
  const query = url.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const acknowledgedAt = status === "ACKNOWLEDGED" ? { not: null } : null;
  const where = {
    announcementId: id,
    acknowledgedAt,
    ...(query ? {
      user: {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      },
    } : {}),
  };

  const [recipients, total] = await Promise.all([
    db.companyAnnouncementRecipient.findMany({
      where,
      orderBy: status === "ACKNOWLEDGED" ? { acknowledgedAt: "desc" } : { user: { name: "asc" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        user: { select: { name: true, email: true, role: { select: { label: true } } } },
        acknowledgedAt: true,
      },
    }),
    db.companyAnnouncementRecipient.count({ where }),
  ]);

  return NextResponse.json({
    items: recipients.map((recipient) => ({
      name: recipient.user.name,
      email: recipient.user.email,
      role: recipient.user.role.label,
      acknowledgedAt: recipient.acknowledgedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    status,
  });
}
