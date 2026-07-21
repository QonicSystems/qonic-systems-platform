import Link from "next/link";
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
    <header className="portal-page-head">
      <p className="eyebrow">Administration</p>
      <h1 className="portal-title">Manage your organisation</h1>
    </header>
    <nav className="admin-tabs" aria-label="Administration sections">
      {visible.map((tab) => <Link key={tab.href} href={tab.href} className="admin-tab">{tab.label}</Link>)}
    </nav>
    {children}
  </div>;
}
