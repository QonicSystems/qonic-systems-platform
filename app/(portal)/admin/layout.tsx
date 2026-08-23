import { PageTabs } from "@/components/portal/page-tabs";
import { can, requirePermission } from "@/lib/auth/guard";

const tabs = [
  { label: "People", href: "/admin", permission: "user.view" },
  // Global Candidates used to live here as its own tab, with its own form and
  // its own API. Both kinds of candidate are now managed in the Candidate Pool.
  { label: "Roles & Permissions", href: "/admin/permissions", permission: "rbac.manage" },
  { label: "Rate Management", href: "/admin/rates", permission: "payout.manage" },
  { label: "Holidays", href: "/admin/holidays", permission: "admin.access" },
  { label: "Audit Log", href: "/admin/audit", permission: "audit.view" },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requirePermission("admin.access");
  const visible = tabs.filter((tab) => can(context, tab.permission));

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Administration</p>
      <h1 className="portal-title">Manage your organisation</h1>
      <p className="portal-lead">People, roles and the audit trail for this workspace.</p>
    </header>
    <PageTabs tabs={visible.map(({ label, href }) => ({ label, href }))} label="Administration sections" />
    {children}
  </div>;
}
