import type { AuthContext } from "@/lib/auth/guard";

/**
 * Validation shared by POST /api/admin/roles and PATCH /api/admin/roles/[id].
 *
 * Split out so the two handlers cannot drift: a rank the create route refuses
 * must stay refused on edit, or the restriction is one PATCH away from being
 * bypassed.
 */

export const ROLE_LABEL_MAX = 60;
export const ROLE_DESCRIPTION_MAX = 300;

/**
 * Rank 0 is the CEO tier and is never issued to a created role — `isSuperAdmin`
 * is what actually grants the bypass, but a second rank-0 role would outrank
 * every guard in lib/auth/authority.ts while holding none of the CEO's rights.
 */
export const ROLE_RANK_MIN = 1;
export const ROLE_RANK_MAX = 999;

export type RoleFieldErrors = Partial<Record<"label" | "description" | "rank", string>>;

/**
 * Turns a role `label` into a stable `key`.
 *
 * Derived on the server and never accepted from the caller: `key` is what
 * `SEEDED_ROLES`, `pruneRetiredRoles` and every remaining role-key check match
 * on, so letting a client choose it would let them claim a key a future seeded
 * role expects — and would let key and label drift apart.
 */
export function roleKeyFrom(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
}

export function validateRoleLabel(label: string): string | undefined {
  if (label.length < 2) return "Please enter a name for this role.";
  if (label.length > ROLE_LABEL_MAX) return `Keep the name to ${ROLE_LABEL_MAX} characters or fewer.`;
  if (!roleKeyFrom(label)) return "Please use at least one letter or number.";
  return undefined;
}

export function validateRoleRank(rank: number): string | undefined {
  if (!Number.isInteger(rank)) return "Rank must be a whole number.";
  if (rank < ROLE_RANK_MIN || rank > ROLE_RANK_MAX) {
    return `Rank must be between ${ROLE_RANK_MIN} and ${ROLE_RANK_MAX}. Rank 0 is reserved for the CEO.`;
  }
  return undefined;
}

/**
 * Refuses a rank at or above the actor's own.
 *
 * The same rule `canAssignRole` applies to assigning a role, applied to
 * creating one: without it a non-super-admin holding `rbac.manage` could mint a
 * rank-1 role that outranks them in every `canAdminister` comparison — a role
 * they could never assign, but which would outrank them everywhere else.
 */
export function mayUseRank(context: AuthContext, rank: number): boolean {
  return context.role.isSuperAdmin || rank > context.role.rank;
}
