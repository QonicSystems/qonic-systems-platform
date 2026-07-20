import Link from "next/link";
import { requireAuth } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const context = await requireAuth();
  const denied = (await searchParams).denied === "1";

  const [teamCount, myContracts] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.contractLetter.count({ where: { subjectUserId: context.user.id } }),
  ]);

  const granted = PERMISSIONS.filter((permission) => context.permissions.has(permission.key));

  return <div className="portal-page">
    {denied && <p className="form-status form-status--error" role="alert">You do not have permission to view that page.</p>}

    <header className="portal-page-head">
      <p className="eyebrow">{context.role.label}</p>
      <h1 className="portal-title">Welcome back, {context.user.name.split(" ")[0]}.</h1>
      <p className="portal-lead">Here is what your account currently has access to.</p>
    </header>

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{teamCount}</span><p>Active team members</p></article>
      <article className="portal-card"><span className="portal-stat">{myContracts}</span><p>My contract letters</p></article>
      <article className="portal-card"><span className="portal-stat">{context.role.isSuperAdmin ? "All" : granted.length}</span><p>Permissions granted</p></article>
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
  </div>;
}
