import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { can, requireAuth } from "@/lib/auth/guard";
import { portalNavigation } from "@/lib/portal-nav";

const SECURITY_PATH = "/profile/security";

export const metadata = { robots: { index: false, follow: false } };

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

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
  const links = portalNavigation
    .filter((link) => !link.permission || can(context, link.permission))
    .map(({ label, href }) => ({ label, href }));

  return <PortalShell
    user={{ name: context.user.name, email: context.user.email, roleLabel: context.role.label, initials: initialsOf(context.user.name) }}
    links={links}
  >{children}</PortalShell>;
}
