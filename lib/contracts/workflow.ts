import type { AuthContext } from "@/lib/auth/guard";
import type { ContractStatus } from "@/lib/generated/prisma/enums";

/**
 * The contract-letter lifecycle, expressed as data rather than branching logic.
 * The table doubles as documentation and makes every rule directly testable.
 *
 *   DRAFT ──submit──▶ PENDING_RELEASE ──release──▶ RELEASED ──ack──▶ ACKNOWLEDGED
 *     ▲                     │                         │
 *     └──changes────────────┘                         └──revoke──▶ REVOKED
 */

/** `SUBJECT_SELF` means "the person the letter is about", not a permission. */
export const SUBJECT_SELF = "SUBJECT_SELF" as const;

export type TransitionRule = {
  from: ContractStatus;
  to: ContractStatus;
  requires: string | typeof SUBJECT_SELF;
  label: string;
  /** Shown on the button in the UI. */
  description: string;
};

export const TRANSITIONS: ReadonlyArray<TransitionRule> = [
  { from: "DRAFT", to: "PENDING_RELEASE", requires: "contract.submit", label: "Submit for release", description: "Send to leadership for approval." },
  { from: "PENDING_RELEASE", to: "CHANGES_REQUESTED", requires: "contract.release", label: "Request changes", description: "Send back to HR with a note." },
  { from: "CHANGES_REQUESTED", to: "PENDING_RELEASE", requires: "contract.submit", label: "Resubmit for release", description: "Send the revised letter back to leadership." },
  { from: "PENDING_RELEASE", to: "RELEASED", requires: "contract.release", label: "Release letter", description: "Approve and issue this letter to the employee." },
  { from: "RELEASED", to: "ACKNOWLEDGED", requires: SUBJECT_SELF, label: "Acknowledge receipt", description: "Confirm you have received and read this letter." },
  { from: "RELEASED", to: "REVOKED", requires: "contract.revoke", label: "Revoke letter", description: "Withdraw a letter that was already issued." },
  { from: "ACKNOWLEDGED", to: "REVOKED", requires: "contract.revoke", label: "Revoke letter", description: "Withdraw a letter that was already issued." },
];

/** Statuses whose content may still be edited by the author. */
export const EDITABLE_STATUSES: ReadonlyArray<ContractStatus> = ["DRAFT", "CHANGES_REQUESTED"];

export type LetterFacts = { status: ContractStatus; subjectUserId: string; authorUserId: string };
export type TransitionCheck = { ok: true; rule: TransitionRule } | { ok: false; reason: string; status: 403 | 409 };

/**
 * Decides whether `actor` may move `letter` to `to`.
 *
 * Beyond permissions, two segregation-of-duties invariants apply, and they hold
 * even for the super admin:
 *   1. Nobody releases or revokes their own contract letter.
 *   2. Only the subject can acknowledge receipt.
 */
export function canTransition(actor: AuthContext, letter: LetterFacts, to: ContractStatus): TransitionCheck {
  const rule = TRANSITIONS.find((candidate) => candidate.from === letter.status && candidate.to === to);
  if (!rule) return { ok: false, reason: `A ${describeStatus(letter.status)} letter cannot be moved to ${describeStatus(to)}.`, status: 409 };

  const isSubject = actor.user.id === letter.subjectUserId;

  if (rule.requires === SUBJECT_SELF) {
    if (!isSubject) return { ok: false, reason: "Only the person this letter is about can acknowledge it.", status: 403 };
    return { ok: true, rule };
  }

  // Segregation of duties: signing off on your own paperwork is never allowed,
  // regardless of role. Checked BEFORE the permission so the message is useful.
  if (isSubject && (to === "RELEASED" || to === "REVOKED" || to === "CHANGES_REQUESTED")) {
    return { ok: false, reason: "You cannot approve or reject your own contract letter.", status: 403 };
  }

  if (!actor.permissions.has(rule.requires)) {
    return { ok: false, reason: "You do not have permission to perform this action.", status: 403 };
  }

  return { ok: true, rule };
}

/** Transitions the actor could perform right now — used to render action buttons. */
export function availableTransitions(actor: AuthContext, letter: LetterFacts): ReadonlyArray<TransitionRule> {
  return TRANSITIONS.filter((rule) => rule.from === letter.status && canTransition(actor, letter, rule.to).ok);
}

export function canEditContent(actor: AuthContext, letter: LetterFacts): boolean {
  if (!EDITABLE_STATUSES.includes(letter.status)) return false;
  if (!actor.permissions.has("contract.generate")) return false;
  // Editing someone else's draft requires the broader view-all grant.
  return letter.authorUserId === actor.user.id || actor.permissions.has("contract.view_all");
}

export function canViewLetter(actor: AuthContext, letter: LetterFacts): boolean {
  if (actor.user.id === letter.subjectUserId) return actor.permissions.has("contract.view_own");
  if (letter.authorUserId === actor.user.id) return actor.permissions.has("contract.generate");
  return actor.permissions.has("contract.view_all");
}

export function describeStatus(status: ContractStatus): string {
  return {
    DRAFT: "draft",
    PENDING_RELEASE: "pending release",
    CHANGES_REQUESTED: "changes requested",
    RELEASED: "released",
    ACKNOWLEDGED: "acknowledged",
    REVOKED: "revoked",
  }[status];
}
