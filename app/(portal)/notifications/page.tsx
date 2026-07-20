import { NotificationList } from "@/components/portal/notification-list";
import { requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const context = await requireAuth();
  const items = await db.notification.findMany({ where: { userId: context.user.id }, orderBy: { createdAt: "desc" }, take: 100 });

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Inbox</p>
      <h1 className="portal-title">Notifications</h1>
      <p className="portal-lead">{items.filter((n) => !n.readAt).length} unread.</p>
    </header>
    <NotificationList items={items.map((item) => ({
      id: item.id, kind: item.kind, title: item.title, body: item.body, link: item.link,
      unread: item.readAt === null,
      when: item.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    }))} />
  </div>;
}
