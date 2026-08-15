/**
 * What a table shows when it has no rows.
 *
 * The app had three different conventions for this — a `.portal-note` replacing
 * the table, an early return, and a `colSpan` row inside the table — so the same
 * situation looked different depending on which screen you were on.
 *
 * `isFiltered` distinguishes "your search matched nothing" from "there is
 * nothing here yet". Those need different words: the first is a dead end the
 * user can back out of, the second usually wants a nudge toward creating
 * something.
 */
export function EmptyState({ message, filteredMessage, isFiltered = false }: {
  message: string;
  filteredMessage?: string;
  isFiltered?: boolean;
}) {
  return <p className="portal-note">
    {isFiltered ? filteredMessage ?? "Nothing matches that search." : message}
  </p>;
}
