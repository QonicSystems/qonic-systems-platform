import { Breadcrumbs } from "@/components/portal/breadcrumbs";
import { PageTabs } from "@/components/portal/page-tabs";
import { can, requireAuth } from "@/lib/auth/guard";

/**
 * Shared chrome for the dashboard tabs.
 *
 * `requireAuth`, never `requirePermission`: lib/auth/guard.ts sends every
 * permission failure to /dashboard?denied=1, so if this layout could 403 a
 * denied user would bounce between the two forever.
 *
 * A tab whose work the user cannot do is hidden rather than shown empty — the
 * same treatment lib/portal-nav.ts gives an empty nav group. Overview and
 * Access have no permission because everyone has an account to look at.
 */
const APPROVAL_PERMISSIONS = ["timesheet.approve", "expense.approve", "leave.approve", "leave.manage"];
const MY_WORK_PERMISSIONS = ["timesheet.submit", "leave.request", "expense.submit", "contract.view_own"];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAuth();
  const anyOf = (keys: string[]) => keys.some((key) => can(context, key));

  const tabs = [
    { label: "Overview", href: "/dashboard", visible: true },
    { label: "My Work", href: "/dashboard/my-work", visible: anyOf(MY_WORK_PERMISSIONS) },
    { label: "Approvals", href: "/dashboard/approvals", visible: anyOf(APPROVAL_PERMISSIONS) },
    { label: "Access", href: "/dashboard/access", visible: true },
  ].filter((tab) => tab.visible);

  return <div className="portal-page">
    <Breadcrumbs items={[{ label: "Home", href: "/dashboard" }, { label: "Dashboard" }]} />
    <header className="portal-page-head">
      <p className="eyebrow">{context.role.label}</p>
      <h1 className="portal-title">Welcome back, {context.user.name.split(" ")[0]}.</h1>
      <p className="portal-lead">Your work, your approvals, and what this account can reach.</p>
    </header>
    <PageTabs tabs={tabs.map(({ label, href }) => ({ label, href }))} label="Dashboard sections" />
    {children}
  </div>;
}
