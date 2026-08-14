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
  // Stays a blanket denial. This guard also feeds deactivate, delete, GDPR
  // erase and contract authoring, where acting on yourself is either a footgun
  // (locking yourself out) or a conflict of interest (writing your own contract
  // letter). The one case that legitimately needs a self-edit — changing your
  // own name or email — opts in explicitly at the route instead; see
  // canEditIdentity below.
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
 * Whether `actor` may edit `target`'s identity fields — name, email, phone,
 * job title. Same as canAdminister except that editing YOURSELF is allowed.
 *
 * Exists because a sole super admin otherwise had no route to change their own
 * email: self-service profile treats email as an identity and refuses it, and
 * the admin console refused every self-edit, leaving only database access. The
 * reason that blanket ban existed — self role escalation — is handled by
 * canChangeOwnRole, which the same route checks separately.
 */
export function canEditIdentity(actor: AuthContext, target: TargetUser): AuthorityResult {
  if (actor.user.id === target.id) return ALLOWED;
  return canAdminister(actor, target);
}

/**
 * Refuses a self role change.
 *
 * This is the half of the blanket self-edit ban that actually mattered: without
 * it, anyone holding `user.manage` could promote themselves in a single
 * request. Identity fields are safe to self-edit; the role is not.
 */
export function canChangeOwnRole(actor: AuthContext, target: TargetUser, roleChanged: boolean): AuthorityResult {
  if (!roleChanged) return ALLOWED;
  if (actor.user.id !== target.id) return ALLOWED;
  return deny("You cannot change your own role. Ask another administrator.", 409);
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
