/**
 * Portal navigation, grouped.
 *
 * Deliberately separate from `navigation` in lib/site.ts — that array feeds the
 * PUBLIC header, and a permission-gated link must never be able to leak into the
 * marketing chrome.
 *
 * Grouping became necessary once Delivery, Recruitment, and Finance landed: a
 * flat bar of 14 links overflowed on a laptop. A group whose children are all
 * hidden disappears entirely, so a role only ever sees headings it can use.
 *
 * A null `permission` means every signed-in user sees the item.
 */
export type NavItem = { label: string; href: string; permission: string | null };
export type NavGroup = { label: string; items: ReadonlyArray<NavItem> };

export const portalNavigation: ReadonlyArray<NavItem | NavGroup> = [
  { label: "Dashboard", href: "/dashboard", permission: null },
  { label: "Candidate Pool", href: "/candidates", permission: "candidate.view" },
  {
    label: "My Work",
    items: [
      { label: "Timesheets", href: "/timesheets", permission: "timesheet.submit" },
      { label: "My Earnings", href: "/earnings", permission: "payout.view_own" },
      { label: "Leave", href: "/leave", permission: "leave.request" },
      { label: "Contract Letters", href: "/contracts", permission: "contract.view_own" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Projects", href: "/projects", permission: "project.view" },
      { label: "Clients", href: "/clients", permission: "client.view" },
    ],
  },
  {
    label: "Recruitment",
    items: [
      { label: "Jobs", href: "/jobs", permission: "job.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/invoices", permission: "invoice.view" },
      // Revenue is the last surviving report. A "Reports" group holding one
      // link rendered as a single-item dropdown, so it sits with Invoices —
      // receivables ageing and placement fees are finance, not a category of
      // their own.
      { label: "Revenue", href: "/reports/revenue", permission: "report.finance" },
    ],
  },
  { label: "Directory", href: "/directory", permission: "directory.view" },
  { label: "Administration", href: "/admin", permission: "admin.access" },
];

export function isGroup(entry: NavItem | NavGroup): entry is NavGroup {
  return "items" in entry;
}
