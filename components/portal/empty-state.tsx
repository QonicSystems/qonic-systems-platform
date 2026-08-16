/**
 * What a table shows when it has no rows.
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
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas-sub/60 px-6 py-12 text-center shadow-xs">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-canvas-muted text-ink-muted">
        {isFiltered ? (
          <svg className="h-5 w-5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        ) : (
          <svg className="h-5 w-5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        )}
      </div>
      <p className="portal-note font-medium text-body">
        {isFiltered ? filteredMessage ?? "Nothing matches that search." : message}
      </p>
    </div>
  );
}
