import { ROLE, type RoleKey } from "@/lib/auth/roles";

/**
 * The permission catalog lives in code because permissions are born with the
 * features that need them. The seed upserts these into the database so the
 * admin console can render its toggle matrix from real rows.
 *
 * Adding a permission: add it here, re-run the seed, then toggle it on for
 * whichever roles should have it.
 */
export const PERMISSIONS = [
  // Portal
  { key: "portal.access", group: "Portal", label: "Access the staff portal", description: "Sign in and see the dashboard.", sortOrder: 10 },
  { key: "directory.view", group: "Portal", label: "View the team directory", description: "See colleagues' names, roles, and work contact details.", sortOrder: 20 },

  // Contract letters
  { key: "contract.view_own", group: "Contract letters", label: "View own contract letters", description: "See contract letters issued to you.", sortOrder: 30 },
  { key: "contract.view_all", group: "Contract letters", label: "View all contract letters", description: "See contract letters for every employee.", sortOrder: 40 },
  { key: "contract.generate", group: "Contract letters", label: "Generate contract letters", description: "Draft and edit contract letters.", sortOrder: 50 },
  { key: "contract.submit", group: "Contract letters", label: "Submit for release", description: "Send a draft to leadership for approval.", sortOrder: 60 },
  { key: "contract.release", group: "Contract letters", label: "Release contract letters", description: "Approve and issue a contract letter to the employee.", sortOrder: 70 },
  { key: "contract.revoke", group: "Contract letters", label: "Revoke contract letters", description: "Withdraw a letter that was already released.", sortOrder: 80 },

  // Delivery
  { key: "client.view", group: "Delivery", label: "View clients", description: "See the client list and their projects.", sortOrder: 40 },
  { key: "client.manage", group: "Delivery", label: "Manage clients", description: "Create and edit clients and their contacts.", sortOrder: 42 },
  { key: "project.view", group: "Delivery", label: "View projects", description: "See every project, not only the ones you are on.", sortOrder: 44 },
  { key: "project.manage", group: "Delivery", label: "Manage projects", description: "Create projects, set budgets, and assign people.", sortOrder: 46 },
  { key: "timesheet.submit", group: "Delivery", label: "Record time", description: "Fill in and submit your own weekly timesheet.", sortOrder: 48 },
  { key: "timesheet.approve", group: "Delivery", label: "Approve timesheets", description: "Approve or reject submitted timesheets.", sortOrder: 50 },

  // Recruitment
  { key: "job.view", group: "Recruitment", label: "View jobs", description: "See open requisitions and their pipelines.", sortOrder: 54 },
  { key: "job.manage", group: "Recruitment", label: "Manage jobs", description: "Create requisitions and publish them to the careers page.", sortOrder: 56 },
  { key: "candidate.view", group: "Recruitment", label: "View candidates", description: "See candidate records and CVs.", sortOrder: 58 },
  { key: "candidate.manage", group: "Recruitment", label: "Manage candidates", description: "Add candidates and move applications through the pipeline.", sortOrder: 60 },
  { key: "placement.manage", group: "Recruitment", label: "Record placements", description: "Mark a candidate placed and set the fee.", sortOrder: 62 },

  // Finance
  { key: "invoice.view", group: "Finance", label: "View invoices", description: "See invoices and what is outstanding.", sortOrder: 64 },
  { key: "invoice.manage", group: "Finance", label: "Manage invoices", description: "Raise invoices, issue them, and void them.", sortOrder: 66 },
  { key: "payment.record", group: "Finance", label: "Record payments", description: "Log payments received against an invoice.", sortOrder: 68 },
  { key: "expense.submit", group: "Finance", label: "Claim expenses", description: "Submit your own expense claims.", sortOrder: 70 },
  { key: "expense.approve", group: "Finance", label: "Approve expenses", description: "Approve, reject, and mark expenses reimbursed.", sortOrder: 72 },
  { key: "report.finance", group: "Finance", label: "View company finance", description: "Revenue, collections, receivables, costs, payouts, and placement fees.", sortOrder: 74 },
  { key: "finance.export", group: "Finance", label: "Export financial data", description: "Download invoice, payment, expense, and approved-time CSV data.", sortOrder: 75 },
  { key: "payout.view_own", group: "Finance", label: "View own earnings", description: "See earnings and raise monthly payment invoices to Qonic Systems.", sortOrder: 76 },
  { key: "payout.view_all", group: "Finance", label: "View all payout data", description: "See every resource's payout breakdown, not only your own.", sortOrder: 77 },
  { key: "compensation.manage", group: "Finance", label: "Set salaries and decide earnings invoices", description: "Set People salaries and approve, reject, or record payment of Qonic earning invoices.", sortOrder: 78 },

  // Leave
  { key: "leave.request", group: "Leave", label: "Request leave", description: "Submit leave requests and see your own balances.", sortOrder: 82 },
  { key: "leave.approve", group: "Leave", label: "Approve leave", description: "Approve or reject leave for the people who report to you.", sortOrder: 84 },
  { key: "leave.manage", group: "Leave", label: "Manage leave for everyone", description: "See and decide any request, and adjust entitlements.", sortOrder: 86 },

  // Administration access is deliberately split by screen and action. A role
  // can, for example, maintain the holiday calendar without access to People.
  { key: "admin.access", group: "Administration", label: "Access Administration", description: "Open the Administration workspace.", sortOrder: 90 },
  { key: "announcement.publish", group: "Administration", label: "Release company announcements", description: "Publish a mandatory company-wide announcement and monitor acknowledgements. CEO only.", sortOrder: 92 },

  // People
  { key: "user.view", group: "People", label: "View People", description: "List and inspect People accounts.", sortOrder: 100 },
  { key: "user.manage", group: "People", label: "Manage People", description: "Create accounts and edit their details. Limited to roles junior to your own.", sortOrder: 110 },
  { key: "user.deactivate", group: "People", label: "Deactivate People", description: "Suspend or restore an account. Suspending signs the person out everywhere.", sortOrder: 112 },
  { key: "user.delete", group: "People", label: "Archive People", description: "Archive an account while preserving its business history.", sortOrder: 114 },
  { key: "user.purge", group: "People", label: "Permanently purge People", description: "Permanently remove an already archived account and its associated records. CEO only.", sortOrder: 116 },

  // Roles & Permissions
  { key: "rbac.manage", group: "Roles & Permissions", label: "Manage Roles & Permissions", description: "Create roles and toggle what each role can do. This capability is controlled by the CEO.", sortOrder: 120 },

  // Holidays
  { key: "holiday.view", group: "Holidays", label: "View Holidays", description: "Open the public holiday calendar used by leave calculations.", sortOrder: 122 },
  { key: "holiday.manage", group: "Holidays", label: "Manage Holidays", description: "Add, remove, and sync public holidays.", sortOrder: 124 },

  // Audit Log
  { key: "audit.view", group: "Audit Log", label: "View Audit Log", description: "Read the record of privileged actions.", sortOrder: 130 },
  { key: "audit.export", group: "Audit Log", label: "Export Audit Log", description: "Download audit-log entries as a CSV file.", sortOrder: 132 },
  { key: "audit.purge", group: "Audit Log", label: "Purge Audit Log", description: "Permanently remove old audit entries after password confirmation. CEO only.", sortOrder: 134 },
] as const satisfies ReadonlyArray<{
  key: string;
  group: string;
  label: string;
  description: string;
  sortOrder: number;
}>;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

/**
 * Permissions switched ON for each role at seed time. The CEO is intentionally
 * absent — `isSuperAdmin` grants everything, so seeding rows for them would be
 * misleading and would imply their access could be toggled off.
 *
 * These are only DEFAULTS. Once seeded, the CEO owns these switches at runtime.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Exclude<RoleKey, "ceo">, ReadonlyArray<PermissionKey>>> = {
  [ROLE.CO_FOUNDER]: [
    "portal.access", "directory.view",
    "contract.view_own", "contract.view_all", "contract.generate", "contract.submit", "contract.release", "contract.revoke",
    "client.view", "client.manage", "project.view", "project.manage",
    "timesheet.submit", "timesheet.approve",
    "job.view", "job.manage", "candidate.view", "candidate.manage", "placement.manage",
    "invoice.view", "invoice.manage", "payment.record", "report.finance", "finance.export",
    "payout.view_own", "payout.view_all", "compensation.manage",
    "leave.request", "leave.approve", "leave.manage",
    "admin.access", "user.view", "user.manage", "user.deactivate",
    "holiday.view", "holiday.manage", "audit.view", "audit.export",
  ],
  [ROLE.DEVELOPER]: [
    "portal.access", "directory.view", "contract.view_own", "leave.request", "timesheet.submit", "payout.view_own",
  ],
};

/** Granting this is equivalent to granting everything, so it stays CEO-only. */
export const SUPER_ADMIN_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(["announcement.publish", "rbac.manage", "user.purge", "audit.purge"]);

// --------------------------------------------------------------- resolution --

export type ResolverRole = { isSuperAdmin: boolean };
export type ResolverOverride = { permissionKey: string; effect: "ALLOW" | "DENY"; expiresAt: Date | null };

/**
 * Resolves a user's effective permissions. Pure on purpose: no database, no
 * clock beyond the injected `now`, so every precedence rule is directly testable.
 *
 * Precedence, highest first:
 *   1. super admin        → allow everything
 *   2. override DENY      → deny (beats a role grant)
 *   3. override ALLOW     → allow
 *   4. role toggle on     → allow
 *   5. otherwise          → deny by default
 *
 * Expired overrides are ignored entirely, which makes temporary elevation
 * self-cleaning without a scheduled job.
 */
export function resolvePermissions(
  role: ResolverRole,
  enabledRolePermissions: ReadonlyArray<string>,
  overrides: ReadonlyArray<ResolverOverride>,
  now: Date = new Date(),
): ReadonlySet<string> {
  if (role.isSuperAdmin) return new Set(PERMISSIONS.map((permission) => permission.key));

  const effective = new Set<string>(enabledRolePermissions);
  const live = overrides.filter((override) => !override.expiresAt || override.expiresAt > now);

  for (const override of live) if (override.effect === "ALLOW") effective.add(override.permissionKey);
  // DENY applied last so it always wins, whatever the role or an ALLOW said.
  for (const override of live) if (override.effect === "DENY") effective.delete(override.permissionKey);

  return effective;
}
