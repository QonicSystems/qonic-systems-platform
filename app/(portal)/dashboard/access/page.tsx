import Link from "next/link";
import { requireAuth } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata = { title: "Access" };

export default async function AccessPage() {
  const context = await requireAuth();
  const granted = PERMISSIONS.filter((permission) => context.permissions.has(permission.key));

  return <>
    <div className="portal-grid">
      <article className="portal-card">
        <span className="portal-stat">{context.role.isSuperAdmin ? "All" : granted.length}</span>
        <p>Permissions granted</p>
      </article>
      <article className="portal-card"><span className="portal-stat">{context.role.label}</span><p>Your role</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Your access</h2>
      {context.role.isSuperAdmin
        ? <p className="portal-note">As <strong>{context.role.label}</strong> you hold super-admin rights — every capability is available to you, and your access cannot be switched off.</p>
        : <p className="portal-note">These are enabled for the <strong>{context.role.label}</strong> role. The CEO can change them at any time.</p>}
      <ul className="permission-list">
        {granted.map((permission) => <li key={permission.key}><strong>{permission.label}</strong><span>{permission.description}</span></li>)}
      </ul>
    </section>

    {context.permissions.has("admin.access") && <p className="portal-note">
      Manage people and permissions in the <Link className="text-link" href="/admin">administration area</Link>.
    </p>}
  </>;
}
