import { NotificationList } from "@/components/portal/notification-list";
import { requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Notifications" };

/**
 * "Today" / "Yesterday" / a date, for the day headings.
 *
 * Compared on the calendar day rather than by elapsed hours, so something sent
 * at 23:50 last night reads as Yesterday rather than "8 hours ago, today".
 */
function dayLabel(value: Date, now: Date): string {
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((startOf(now) - startOf(value)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return value.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "just now", "2h ago", "3d ago" — the at-a-glance stamp on each row. */
function ago(value: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - value.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function NotificationsPage() {
  const context = await requireAuth();
  const items = await db.notification.findMany({
    where: { userId: context.user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Hoisted out of the map: reading the clock per row would give each one a
  // slightly different "now" and the lint rule treats it as impure in render.
  const now = new Date();
  const unread = items.filter((n) => !n.readAt).length;

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Inbox</p>
      <h1 className="portal-title">Notifications</h1>
      <p className="portal-lead">
        {items.length === 0
          ? "Nothing has come in yet."
          : unread === 0
          ? `${items.length} notification${items.length === 1 ? "" : "s"} · all read.`
          : `${unread} unread of ${items.length}.`}
      </p>
    </header>

    <NotificationList items={items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      link: item.link,
      unread: item.readAt === null,
      day: dayLabel(item.createdAt, now),
      ago: ago(item.createdAt, now),
      when: item.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
    }))} />
  </div>;
}
