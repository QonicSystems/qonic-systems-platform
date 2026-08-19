import Link from "next/link";
import { requireAuth } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata = { title: "Access" };

export default async function AccessPage() {
  const context = await requireAuth();
  const granted = PERMISSIONS.filter((permission) => context.permissions.has(permission.key));

  // Grouped by the same catalog groups the admin console's toggle matrix
  // uses (components/admin/permission-matrix.tsx), so a long flat list
  // becomes a scannable set of sections instead of one wall of ~30 items.
  const groupNames = [...new Set(granted.map((permission) => permission.group))];

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Account</p>
      <h1 className="portal-title">Your access</h1>
      <p className="portal-lead">
        {context.role.isSuperAdmin
          ? <>As <strong>{context.role.label}</strong> you hold super-admin rights — every capability is available to you, and your access cannot be switched off.</>
          : <>Enabled for the <strong>{context.role.label}</strong> role. The CEO can change these at any time.</>}
      </p>
    </header>

    <div className="portal-grid">
      <article className="portal-card">
        <span className="portal-stat">{context.role.isSuperAdmin ? "All" : granted.length}</span>
        <p>Permissions granted</p>
      </article>
      <article className="portal-card"><span className="portal-stat">{context.role.label}</span><p>Your role</p></article>
      {context.permissions.has("admin.access") && <article className="portal-card">
        <span className="portal-stat" style={{ fontSize: "1.4rem" }}>
          <Link className="card-link" href="/admin">Administration →</Link>
        </span>
        <p>Manage people & permissions</p>
      </article>}
    </div>

    {groupNames.map((groupName) => <section className="portal-section" key={groupName}>
      <h2 className="portal-section-title">{groupName}</h2>
      <ul className="permission-list">
        {granted.filter((permission) => permission.group === groupName).map((permission) => <li key={permission.key}><strong>{permission.label}</strong><span>{permission.description}</span></li>)}
      </ul>
    </section>)}
  </div>;
}
