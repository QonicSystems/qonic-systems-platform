import type { AuthContext } from "@/lib/auth/guard";
import type { ApplicationStage } from "@/lib/generated/prisma/enums";

/**
 * The recruitment pipeline, expressed as data — same approach as the contract
 * letter workflow, so every rule is directly testable and the table doubles as
 * documentation.
 *
 *   SOURCED → SCREENED → SUBMITTED → INTERVIEW → OFFER → PLACED
 *
 * REJECTED and WITHDRAWN are reachable from any live stage: a candidate can drop
 * out, or be turned down, at any point.
 */
export const PIPELINE: ReadonlyArray<ApplicationStage> = ["SOURCED", "SCREENED", "SUBMITTED", "INTERVIEW", "OFFER", "PLACED"];

/** Stages an application can no longer move on from. */
export const TERMINAL_STAGES: ReadonlyArray<ApplicationStage> = ["PLACED", "REJECTED", "WITHDRAWN"];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  SOURCED: "Sourced",
  SCREENED: "Screened",
  SUBMITTED: "Submitted to client",
  INTERVIEW: "Interviewing",
  OFFER: "Offer",
  PLACED: "Placed",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export type StageCheck = { ok: true } | { ok: false; reason: string; status: 403 | 409 };

/**
 * Decides whether an application may move to `to`.
 *
 * Forward movement is one step at a time so the history stays meaningful — a
 * jump straight from SOURCED to OFFER would hide the screening that supposedly
 * happened. Moving BACK is allowed, because a candidate genuinely can be sent
 * back for another interview round.
 */
export function canMoveStage(actor: AuthContext, current: ApplicationStage, to: ApplicationStage): StageCheck {
  if (!actor.permissions.has("candidate.manage")) {
    return { ok: false, reason: "You do not have permission to move candidates through the pipeline.", status: 403 };
  }
  if (current === to) return { ok: false, reason: "The application is already at that stage.", status: 409 };

  if (TERMINAL_STAGES.includes(current)) {
    return { ok: false, reason: `A ${STAGE_LABELS[current].toLowerCase()} application cannot be moved.`, status: 409 };
  }

  // Dropping out is always available from a live stage.
  if (to === "REJECTED" || to === "WITHDRAWN") return { ok: true };

  const from = PIPELINE.indexOf(current);
  const next = PIPELINE.indexOf(to);
  if (next === -1) return { ok: false, reason: "That is not a valid stage.", status: 409 };

  // PLACED is reached by recording a placement, not by moving the stage — that
  // route captures the salary and fee the business depends on.
  if (to === "PLACED") {
    return { ok: false, reason: "Record a placement instead — it captures the salary and fee.", status: 409 };
  }

  if (next > from + 1) {
    return { ok: false, reason: `Move to ${STAGE_LABELS[PIPELINE[from + 1]]} first — skipping stages loses the history.`, status: 409 };
  }

  return { ok: true };
}

/** Stages the actor could move this application to right now. */
export function availableStages(actor: AuthContext, current: ApplicationStage): ReadonlyArray<ApplicationStage> {
  const all: ApplicationStage[] = [...PIPELINE, "REJECTED", "WITHDRAWN"];
  return all.filter((stage) => canMoveStage(actor, current, stage).ok);
}

export type JobFacts = { status: string; slaDays: number | null; createdAt: Date };

/**
 * Flags a requisition that has been open longer than its agreed SLA — the
 * single most useful signal on a recruitment desk.
 */
export function jobAgeing(job: JobFacts, asOf: Date = new Date()): { days: number; overSla: boolean } {
  const days = Math.floor((asOf.getTime() - job.createdAt.getTime()) / 86_400_000);
  return { days, overSla: job.slaDays !== null && job.status === "OPEN" && days > job.slaDays };
}

export type FunnelCounts = Record<string, number>;

/** Conversion between two stages, guarding against divide-by-zero. */
export function conversionRate(counts: FunnelCounts, from: ApplicationStage, to: ApplicationStage): number {
  const denominator = counts[from] ?? 0;
  if (denominator === 0) return 0;
  return (counts[to] ?? 0) / denominator;
}
