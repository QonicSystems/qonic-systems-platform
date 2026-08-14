import { statusChipClass, statusLabel } from "@/lib/ui/status";

/**
 * The pill used for every workflow state in the portal — invoice, leave,
 * contract, application stage, account status. Colour comes from the
 * `.status-chip--*` modifiers in globals.css, which cover ~35 states.
 *
 * `label` is for the cases that already had prettier wording than the raw enum
 * (contract letters use describeStatus); everything else gets the enum
 * lowercased with underscores turned into spaces, which is what all twelve
 * previous call sites did by hand.
 */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  return <span className={statusChipClass(status)}>{label ?? statusLabel(status)}</span>;
}
