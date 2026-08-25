/**
 * The three built-in roles. Every other role is created through the admin
 * console with no code change and no migration.
 *
 * These three are permanent: `isSystem` marks them, and the delete endpoint
 * refuses them. That is not bureaucracy — Developer is the role the Candidate
 * Pool assigns, so deleting it would leave staff onboarding with nothing to
 * hand out.
 *
 * Code should almost never branch on these. Authorization decisions go through
 * permissions (see permissions.ts); the only legitimate role checks are
 * `isSuperAdmin` (the CEO bypass) and `rank` (the escalation guard).
 */
export const ROLE = {
  CEO: "ceo",
  CO_FOUNDER: "co_founder",
  DEVELOPER: "developer",
} as const;

export type RoleKey = (typeof ROLE)[keyof typeof ROLE];

/** Lower rank = more senior. Used to stop juniors administering seniors. */
export const SEEDED_ROLES: ReadonlyArray<{
  key: RoleKey;
  label: string;
  description: string;
  isSuperAdmin: boolean;
  rank: number;
  /** See Role.viaCandidatePool in prisma/schema.prisma. */
  viaCandidatePool: boolean;
}> = [
  { key: ROLE.CEO, label: "CEO & Founder", description: "Full super-admin. Controls what every other role can do.", isSuperAdmin: true, rank: 0, viaCandidatePool: false },
  { key: ROLE.CO_FOUNDER, label: "Co-Founder", description: "Leadership & Executive. Full operational control across projects, clients, and contracts.", isSuperAdmin: false, rank: 10, viaCandidatePool: false },
  { key: ROLE.DEVELOPER, label: "Developer", description: "Engineering and project delivery staff. Onboarded from the Candidate Pool, never from Administration → People.", isSuperAdmin: false, rank: 50, viaCandidatePool: true },
];

/**
 * Ranks at or above this (numerically at or below) are "leadership": they
 * receive approval notifications, can own a client relationship, and are kept
 * out of the approvals queue as submitters.
 *
 * Derived from `rank` rather than from a list of role keys so that a role the
 * CEO creates at rank 10 or better is treated as leadership automatically. With
 * the seeded ranks (CEO 0, Co-Founder 10, Employee 50) this is exactly the
 * previous behaviour.
 */
export const LEADERSHIP_MAX_RANK = 10;

/** Prisma `where` fragment for the roles LEADERSHIP_MAX_RANK covers. */
export const leadershipRoleWhere = { rank: { lte: LEADERSHIP_MAX_RANK } } as const;

/**
 * Its complement: delivery and support staff.
 *
 * These are the people who book time, are assigned to projects, and are paid
 * through the payout pipeline. Kept as its own constant rather than negating
 * the above at each call site, so the two can never disagree about where the
 * boundary sits.
 */
export const nonLeadershipRoleWhere = { rank: { gt: LEADERSHIP_MAX_RANK } } as const;

/** The same test for a role already loaded into memory. */
export function isLeadershipRank(rank: number): boolean {
  return rank <= LEADERSHIP_MAX_RANK;
}
