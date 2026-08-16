"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = { kind: string; label: string; sub: string; href: string };

/** Permission scoping happens on the server — this only renders what came back. */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Debounced so typing does not fire a query per keystroke.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) { setHits([]); return; }
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (response.ok) { setHits(((await response.json()) as { hits: Hit[] }).hits); setOpen(true); }
      } catch { /* aborted or offline — leave the previous results */ }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  return (
    <div className="global-search" ref={container}>
      <div className="relative flex items-center">
        <svg
          className="absolute left-2.5 w-3.5 h-3.5 text-white/50 pointer-events-none"
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
          type="search"
          className="global-search-input"
          value={query}
          placeholder="Search..."
          aria-label="Search people, clients, projects, jobs, and candidates"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        />
        <kbd className="hidden sm:inline-flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/70 bg-white/10 px-1.5 py-0.5 rounded border border-white/20 pointer-events-none select-none tracking-wide">
          ⌘K
        </kbd>
      </div>
      {open && hits.length > 0 && (
        <div className="global-search-results" role="listbox">
          {hits.map((hit) => (
            <Link
              key={`${hit.kind}-${hit.href}-${hit.label}`}
              href={hit.href}
              className="global-search-hit"
              onClick={() => { setOpen(false); setQuery(""); }}
            >
              <span className="global-search-kind">{hit.kind}</span>
              <span>
                <strong>{hit.label}</strong>
                <span>{hit.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {open && query.trim().length >= 2 && hits.length === 0 && (
        <div className="global-search-results">
          <p className="global-search-empty">Nothing found for &ldquo;{query}&rdquo;.</p>
        </div>
      )}
    </div>
  );
}
