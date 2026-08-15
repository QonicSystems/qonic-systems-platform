"use client";

import type { ReactNode } from "react";

/**
 * The bar above a data table: a search field on the left, the primary action on
 * the right.
 *
 * Every table in the portal previously did this differently — some put the
 * create button in a left-aligned `.action-bar`, some in a bare `<p>` so a hint
 * could sit beside it, and only one had a search box at all. This is the single
 * shape, so the sections read as one product.
 *
 * Search is optional: pass `onSearch` to show the field. Filtering itself is the
 * caller's business (see lib/ui/filter.ts) because only the caller knows which
 * fields are worth matching.
 */
export function TableToolbar({ search, onSearch, placeholder, label, children }: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  /** Describes the field for screen readers, e.g. "Search people". */
  label?: string;
  /** The primary action(s), right-aligned. */
  children?: ReactNode;
}) {
  if (!onSearch && !children) return null;

  return <div className="action-bar action-bar--split">
    {onSearch
      ? <input
          className="search-input"
          type="search"
          value={search ?? ""}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder ?? "Search…"}
          aria-label={label ?? placeholder ?? "Search"}
        />
      // Keeps the action on the right even with no search field, since
      // .action-bar--split relies on there being two children.
      : <span />}
    {children}
  </div>;
}
