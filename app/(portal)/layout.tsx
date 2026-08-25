import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ErrorPage } from "@/components/error-page";
import { CompanyAnnouncementGate, type PendingCompanyAnnouncement } from "@/components/portal/company-announcement-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { can, requireAuth } from "@/lib/auth/guard";
import { companyAnnouncementAudienceWhere } from "@/lib/company-announcements";
import type { ContractPayload } from "@/lib/contracts/payload";
import { db } from "@/lib/db";
import { isGroup, portalNavigation, type NavGroup, type NavItem } from "@/lib/portal-nav";

const SECURITY_PATH = "/profile/security";

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAuth();

  // `portal.access` is offered as a toggle in the admin console, so it has to
  // actually gate something — until now nothing read it and switching it off
  // changed nothing. Rendered rather than redirected on purpose: every portal
  // route lives under this layout and /login bounces signed-in visitors back to
  // /dashboard, so any redirect from here is an infinite loop.
  if (!can(context, "portal.access")) return <ErrorPage code={403} homeHref="/" />;

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

  // Employment type is a term of the contract, not a field on the person — it
  // lives in the frozen payload of whichever letter last set it (see
  // docs/ROADMAP.md: letters are immutable once issued), not on User.
  const [latestLetter, pendingAnnouncementReceipts] = await Promise.all([
    db.contractLetter.findFirst({
      where: { subjectUserId: context.user.id, status: { in: ["RELEASED", "ACKNOWLEDGED"] } },
      orderBy: { updatedAt: "desc" },
      select: { payload: true },
    }),
    db.companyAnnouncementRecipient.findMany({
      // Defensive audience check as well as the recipient snapshot. It means
      // a legacy, wrongly-linked Candidate account can never be blocked by an
      // old announcement while the forward data repair is deploying.
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
    }),
  ]);
  const employmentType = latestLetter ? (latestLetter.payload as unknown as ContractPayload).employmentType : null;
  const pendingAnnouncements: PendingCompanyAnnouncement[] = pendingAnnouncementReceipts.map(({ announcement }) => ({
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    releasedAt: announcement.releasedAt.toISOString(),
    releasedBy: announcement.releasedBy.name,
  }));

  return <>
    <PortalShell
      user={{ name: context.user.name, email: context.user.email, roleLabel: context.role.label, photoUrl: context.user.photoUrl, employmentType }}
      links={links}
      unreadCount={context.user.unreadNotificationCount}
    >{children}</PortalShell>
    <CompanyAnnouncementGate initialAnnouncements={pendingAnnouncements} />
  </>;
}
