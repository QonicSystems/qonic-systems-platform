import type { AuthContext } from "@/lib/auth/guard";

export type TargetUser = {
  id: string;
  role: { key: string; rank: number; isSuperAdmin: boolean };
};

export type AuthorityResult = { ok: true } | { ok: false; reason: string; status: 403 | 409 };

const ALLOWED: AuthorityResult = { ok: true };
const deny = (reason: string, status: 403 | 409 = 403): AuthorityResult => ({ ok: false, reason, status });

/**
 * Decides whether `actor` may administer `target`.
 *
 * The rule is seniority by rank: you may only act on someone whose role rank is
 * STRICTLY GREATER (more junior) than your own. With the seeded ranks
 * (CEO 0, Co-Founder 10, HR/Accounts/Projects 20, Employee 50) this gives
 * exactly the intended behaviour — HR can administer Employees but not Accounts
 * or Projects, because those share HR's rank.
 *
 * The super admin bypasses the comparison entirely.
 */
export function canAdminister(actor: AuthContext, target: TargetUser): AuthorityResult {
  // Editing yourself through the admin console would let anyone with user.manage
  // change their own role and escalate in a single request.
  if (actor.user.id === target.id) return deny("You cannot change your own account here. Use your profile instead.", 409);

  if (actor.role.isSuperAdmin) return ALLOWED;

  // Nobody but a super admin may touch a super admin.
  if (target.role.isSuperAdmin) return deny("You cannot administer the super admin account.");

  if (target.role.rank <= actor.role.rank) {
    return deny(`You can only manage people in roles junior to ${actor.role.label}.`);
  }
  return ALLOWED;
}

/**
 * Decides whether `actor` may move someone INTO `targetRole`.
 *
 * Without this, a user holding `user.manage` could promote a junior colleague —
 * or themselves via a second account — to Co-Founder.
 */
export function canAssignRole(actor: AuthContext, targetRole: { rank: number; isSuperAdmin: boolean }): AuthorityResult {
  if (actor.role.isSuperAdmin) return ALLOWED;
  if (targetRole.isSuperAdmin) return deny("Only the super admin can grant super-admin access.");
  if (targetRole.rank <= actor.role.rank) return deny("You cannot assign a role at or above your own level.");
  return ALLOWED;
}

/** Human-readable summary used by the admin UI to explain what a viewer can do. */
export function describeAuthority(actor: AuthContext): string {
  if (actor.role.isSuperAdmin) return "You can edit, deactivate, and remove any account.";
  return `You can edit accounts in roles junior to ${actor.role.label}.`;
}
