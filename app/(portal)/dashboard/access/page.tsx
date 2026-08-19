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
    <div className="hero-panel">
      <span className="hero-eyebrow">{context.role.label}</span>
      <h1 className="hero-title">Your access</h1>
      <p className="hero-lead">
        {context.role.isSuperAdmin
          ? "You hold super-admin rights — every capability is available to you, and your access cannot be switched off."
          : "The CEO controls what your role can do, at runtime, from the permission matrix — this is exactly what's switched on for you right now."}
      </p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value">{context.role.isSuperAdmin ? "All" : granted.length}</span>
          <p className="hero-stat-label">Permissions granted</p>
        </div>
        <div>
          <span className="hero-stat-value">{groupNames.length}</span>
          <p className="hero-stat-label">Capability areas</p>
        </div>
        {context.permissions.has("admin.access") && <div>
          <span className="hero-stat-value" style={{ fontSize: "1.5rem" }}><Link href="/admin" style={{ color: "inherit" }}>Manage →</Link></span>
          <p className="hero-stat-label">Roles & permissions</p>
        </div>}
      </div>
    </div>

    <div className="capability-grid">
      {groupNames.map((groupName) => {
        const items = granted.filter((permission) => permission.group === groupName);
        return <article className="capability-tile" key={groupName}>
          <div className="capability-tile-head">
            <span className="capability-tile-icon" aria-hidden="true">{groupName.charAt(0)}</span>
            <h3>{groupName}</h3>
            <span className="capability-tile-count">{items.length}</span>
          </div>
          <ul>
            {items.map((permission) => <li key={permission.key}><strong>{permission.label}</strong><span>{permission.description}</span></li>)}
          </ul>
        </article>;
      })}
    </div>
  </div>;
}
