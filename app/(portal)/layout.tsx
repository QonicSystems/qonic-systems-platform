import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { can, requireAuth } from "@/lib/auth/guard";
import { isGroup, portalNavigation, type NavGroup, type NavItem } from "@/lib/portal-nav";
import { db } from "@/lib/db";

const SECURITY_PATH = "/profile/security";

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAuth();

  // A bootstrapped or admin-reset account must set its own password before it
  // can reach anything else. Checked server-side on every portal render, so it
  // cannot be skipped by navigating directly.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (context.user.mustChangePassword && !pathname.startsWith(SECURITY_PATH)) redirect(`${SECURITY_PATH}?first=1`);

  // Links are filtered server-side. The shell is a dumb renderer, so a gated
  // link never reaches the browser — but every page still re-checks its own
  // permission, because hidden navigation is not access control.
  const links: Array<NavItem | NavGroup> = [];
  for (const entry of portalNavigation) {
    if (!isGroup(entry)) {
      if (!entry.permission || can(context, entry.permission)) links.push(entry);
      continue;
    }
    const items = entry.items.filter((item) => !item.permission || can(context, item.permission));
    // A group with nothing under it is noise, so drop it entirely.
    if (items.length > 0) links.push({ label: entry.label, items });
  }

  const unreadCount = await db.notification.count({ where: { userId: context.user.id, readAt: null } });

  return <PortalShell
    user={{ name: context.user.name, email: context.user.email, roleLabel: context.role.label, photoUrl: context.user.photoUrl }}
    links={links}
    unreadCount={unreadCount}
  >{children}</PortalShell>;
}
