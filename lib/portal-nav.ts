/**
 * Portal navigation. Deliberately separate from `navigation` in lib/site.ts —
 * that array feeds the PUBLIC header, and a permission-gated link must never be
 * able to leak into the marketing chrome.
 *
 * A null `permission` means every signed-in user sees the link.
 */
export const portalNavigation: ReadonlyArray<{ label: string; href: string; permission: string | null }> = [
  { label: "Dashboard", href: "/dashboard", permission: null },
  { label: "Directory", href: "/directory", permission: "directory.view" },
  // Contract letters land in Phase 2. Their PERMISSIONS are already seeded and
  // toggleable by the CEO, so the workflow can be dropped in behind them —
  // but the link stays out until /contracts exists, rather than 404ing.
  { label: "Administration", href: "/admin", permission: "admin.access" },
];
