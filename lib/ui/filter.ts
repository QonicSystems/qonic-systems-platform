"use client";

import { useMemo, useState } from "react";

/**
 * Client-side table filtering.
 *
 * Extracted from components/ats/candidate-manager.tsx, which was the only table
 * in the app with a search box. The rows are already in memory — every portal
 * table is server-rendered in full — so matching them here is instant and needs
 * no endpoint, no debounce and no loading state.
 *
 * `fields` returns the strings worth matching for a row. They are joined and
 * lowercased once per query, not per row per keystroke.
 *
 * Returns `query`, `setQuery`, the filtered `rows`, and `isFiltered` so callers
 * can tell "no results for this search" apart from "nothing here yet" — the
 * distinction the original made and most tables did not.
 */
export function useFilter<T>(rows: ReadonlyArray<T>, fields: (row: T) => ReadonlyArray<string | null | undefined>) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => fields(row).filter(Boolean).join(" ").toLowerCase().includes(needle));
    // `fields` is recreated each render by callers writing it inline; depending
    // on it would recompute every render and defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);

  return { query, setQuery, rows: filtered, isFiltered: query.trim().length > 0 };
}
