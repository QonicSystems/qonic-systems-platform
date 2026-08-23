"use client";

import type { ReactNode } from "react";

/**
 * The bar above a data table: a search field on the left, the actions on the
 * right.
 *
 * The actions are wrapped in their own flex group rather than being dropped
 * straight into the `justify-between` row. With one action the result is
 * identical; with two, the bare children were spread to opposite ends of the
 * bar — the search box, one button, a gap, and the other button pinned to the
 * far edge, reading as two unrelated controls rather than a pair.
 */
export function TableToolbar({ search, onSearch, placeholder, label, children }: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  label?: string;
  children?: ReactNode;
}) {
  if (!onSearch && !children) return null;

  return (
    <div className="action-bar action-bar--split flex flex-wrap items-center justify-between gap-4 mb-4">
      {onSearch ? (
        <div className="relative flex items-center min-w-[220px] max-w-sm flex-1 sm:flex-none">
          <svg
            className="absolute left-3 w-4 h-4 text-faint pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="search-input !pl-9 !pr-4 w-full"
            type="search"
            value={search ?? ""}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={placeholder ?? "Search…"}
            aria-label={label ?? placeholder ?? "Search"}
          />
        </div>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
