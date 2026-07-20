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
  { label: "Timesheets", href: "/timesheets", permission: "timesheet.submit" },
  { label: "Projects", href: "/projects", permission: "project.view" },
  { label: "Clients", href: "/clients", permission: "client.view" },
  { label: "Utilisation", href: "/reports", permission: "report.utilization" },
  { label: "Leave", href: "/leave", permission: "leave.request" },
  { label: "Contract Letters", href: "/contracts", permission: "contract.view_own" },
  { label: "Administration", href: "/admin", permission: "admin.access" },
];
