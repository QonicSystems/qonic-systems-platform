/**
 * Turns a Prisma enum value into the `.status-chip--*` modifier and the human
 * label that go with it.
 *
 * This was inlined at twelve call sites in two subtly different forms — half
 * ran `.replace(/_/g, "-")` and half did not, which worked only because those
 * particular enums happened to have no underscores. A status like
 * PENDING_RELEASE reaching one of the shorter versions would have produced
 * `status-chip--pending_release`, which matches no rule in globals.css and
 * renders an unstyled chip. One implementation removes that trap.
 */
export function statusSlug(status: string): string {
  return status.toLowerCase().replace(/_/g, "-");
}

/** `status-chip status-chip--pending-release` */
export function statusChipClass(status: string): string {
  return `status-chip status-chip--${statusSlug(status)}`;
}

/** `PENDING_RELEASE` -> `pending release`. Styled lowercase by .status-chip. */
export function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}
