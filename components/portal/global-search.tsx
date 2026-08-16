"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = { kind: string; label: string; sub: string; href: string };

/**
 * Global Search Spotlight / Command Palette.
 * Rendered as a compact trigger button in the navbar, opening a centered spotlight modal.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setSelectedIndex(0);
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    // Debounced so typing does not fire a query per keystroke.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([]);
        setSelectedIndex(0);
        return;
      }
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (response.ok) {
          const data = (await response.json()) as { hits: Hit[] };
          setHits(data.hits);
          setSelectedIndex(0);
        }
      } catch {
        /* aborted or offline — leave the previous results */
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (hits.length > 0 ? (prev + 1) % hits.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (hits.length > 0 ? (prev - 1 + hits.length) % hits.length : 0));
    } else if (event.key === "Enter" && hits[selectedIndex]) {
      event.preventDefault();
      window.location.href = hits[selectedIndex].href;
      setOpen(false);
    }
  };

  return (
    <>
      {/* Compact Navbar Trigger Button */}
      <button
        type="button"
        className="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search platform (Cmd+K)"
        title="Search platform (⌘K)"
      >
        <svg
          className="w-3.5 h-3.5 text-white/60 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="global-search-trigger-text hidden xl:inline">Search...</span>
        <kbd className="global-search-trigger-kbd">⌘K</kbd>
      </button>

      {/* Spotlight Command Palette Modal */}
      {open && (
        <div
          className="global-search-backdrop"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Platform search palette"
        >
          <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="global-search-input-wrapper">
              <svg
                className="w-5 h-5 text-amber-400 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="global-search-modal-input"
                value={query}
                placeholder="Search candidates, jobs, clients, projects, people..."
                aria-label="Search query"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              {query && (
                <button
                  type="button"
                  className="text-xs text-white/40 hover:text-white/80 p-1"
                  onClick={() => setQuery("")}
                  aria-label="Clear query"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                className="global-search-esc-badge"
                onClick={() => setOpen(false)}
                aria-label="Close search"
              >
                ESC
              </button>
            </div>

            {/* Results container */}
            <div className="global-search-results-list" role="listbox">
              {hits.length > 0 &&
                hits.map((hit, index) => (
                  <Link
                    key={`${hit.kind}-${hit.href}-${hit.label}-${index}`}
                    href={hit.href}
                    className={`global-search-modal-hit ${index === selectedIndex ? "is-selected" : ""}`}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className="global-search-modal-kind">{hit.kind}</span>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-slate-100 font-semibold">{hit.label}</strong>
                      <span className="block truncate text-xs text-slate-400">{hit.sub}</span>
                    </div>
                    <svg className="w-4 h-4 text-white/30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                ))}

              {query.trim().length >= 2 && hits.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">
                  <p>No results found for &ldquo;<span className="text-amber-300 font-semibold">{query}</span>&rdquo;</p>
                  <p className="text-xs text-slate-500 mt-1">Try searching by candidate name, skill, job title, client code, or colleague email.</p>
                </div>
              )}

              {!query.trim() && (
                <div className="py-6 px-4 text-xs text-slate-400 flex items-center justify-between border-t border-white/5">
                  <span className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono text-[10px]">↑</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono text-[10px]">↓</kbd>
                    <span>to navigate</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono text-[10px]">↵</kbd>
                    <span>to select</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono text-[10px]">ESC</kbd>
                    <span>to dismiss</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
