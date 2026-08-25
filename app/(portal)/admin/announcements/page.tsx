import { redirect } from "next/navigation";
import { CompanyAnnouncementManager, type CompanyAnnouncementRow } from "@/components/admin/company-announcement-manager";
import { requirePermission } from "@/lib/auth/guard";
import { mayPublishCompanyAnnouncements } from "@/lib/company-announcements";
import { db } from "@/lib/db";

export const metadata = { title: "Company announcements" };

/** The CEO's release console. A Co-Founder cannot reach or operate this route. */
export default async function CompanyAnnouncementsPage() {
  const context = await requirePermission("announcement.publish");
  if (!mayPublishCompanyAnnouncements(context.role)) redirect("/admin?denied=1");

  const [announcements, acknowledgements] = await Promise.all([
    db.companyAnnouncement.findMany({
      orderBy: { releasedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        message: true,
        status: true,
        releasedAt: true,
        revokedAt: true,
        releasedBy: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    }),
    db.companyAnnouncementRecipient.groupBy({
      by: ["announcementId"],
      where: { acknowledgedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const acknowledgementCount = new Map(acknowledgements.map((entry) => [entry.announcementId, entry._count._all]));
  const rows: CompanyAnnouncementRow[] = announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    status: announcement.status,
    releasedAt: announcement.releasedAt.toISOString(),
    revokedAt: announcement.revokedAt?.toISOString() ?? null,
    releasedBy: announcement.releasedBy.name,
    recipientCount: announcement._count.recipients,
    acknowledgedCount: acknowledgementCount.get(announcement.id) ?? 0,
  }));

  // The key intentionally remounts the interactive manager after the CEO
  // releases a notice and refreshes the route, so the summary and history are
  // always the latest server snapshot rather than stale client state.
  const snapshotKey = `${rows[0]?.id ?? "empty"}:${rows.length}`;

  return <section className="portal-section">
    <h2 className="portal-section-title">Company announcements</h2>
    <p className="portal-note">
      Release a message to active People accounts. The CEO, Developers, and Global Candidates are excluded;
      recipients are fixed at release time and acknowledgement progress remains visible here.
    </p>
    <CompanyAnnouncementManager key={snapshotKey} announcements={rows} />
  </section>;
}
