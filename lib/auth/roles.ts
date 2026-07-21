/**
 * Role keys seeded on first run. These are the roles the business starts with —
 * more can be created through the admin console with no code change.
 *
 * Code should almost never branch on these. Authorization decisions go through
 * permissions (see permissions.ts); the only legitimate role checks are
 * `isSuperAdmin` (the CEO bypass) and `rank` (the escalation guard).
 */
export const ROLE = {
  CEO: "ceo",
  CO_FOUNDER: "co_founder",
  HR: "hr",
  ACCOUNTS: "accounts",
  PROJECTS: "projects",
  EMPLOYEE: "employee",
} as const;

export type RoleKey = (typeof ROLE)[keyof typeof ROLE];

/** Lower rank = more senior. Used to stop juniors administering seniors. */
export const SEEDED_ROLES: ReadonlyArray<{
  key: RoleKey;
  label: string;
  description: string;
  isSuperAdmin: boolean;
  rank: number;
}> = [
  { key: ROLE.CEO, label: "CEO & Founder", description: "Full super-admin. Controls what every other role can do.", isSuperAdmin: true, rank: 0 },
  { key: ROLE.CO_FOUNDER, label: "Co-Founder", description: "Leadership. Can release contract letters alongside the CEO.", isSuperAdmin: false, rank: 10 },
  { key: ROLE.HR, label: "HR", description: "People operations. Drafts contract letters for leadership to release.", isSuperAdmin: false, rank: 20 },
  { key: ROLE.ACCOUNTS, label: "Accounts", description: "Finance and billing.", isSuperAdmin: false, rank: 20 },
  { key: ROLE.PROJECTS, label: "Projects", description: "Delivery and project management.", isSuperAdmin: false, rank: 20 },
  { key: ROLE.EMPLOYEE, label: "Employee", description: "Standard staff access, e.g. developers.", isSuperAdmin: false, rank: 50 },
];
