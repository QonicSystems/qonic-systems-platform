import { Breadcrumbs } from "@/components/portal/breadcrumbs";
import { PageTabs } from "@/components/portal/page-tabs";
import { can, requirePermission } from "@/lib/auth/guard";

const tabs = [
  { label: "People", href: "/admin", permission: "user.view" },
  { label: "Roles & Permissions", href: "/admin/permissions", permission: "rbac.manage" },
  { label: "Audit Log", href: "/admin/audit", permission: "audit.view" },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requirePermission("admin.access");
  const visible = tabs.filter((tab) => can(context, tab.permission));

  return <div className="portal-page">
    <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Administration" }]} />
    <header className="portal-page-head">
      <p className="eyebrow">Administration</p>
      <h1 className="portal-title">Manage your organisation</h1>
      <p className="portal-lead">People, roles and the audit trail for this workspace.</p>
    </header>
    <PageTabs tabs={visible.map(({ label, href }) => ({ label, href }))} label="Administration sections" />
    {children}
  </div>;
}
