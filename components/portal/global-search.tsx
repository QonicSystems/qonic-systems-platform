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

  useEffect(() => {
    // Debounced so typing does not fire a query per keystroke. The short-query
    // reset happens inside the timeout rather than the effect body — a sync
    // setState there causes a cascading render.
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
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return <div className="global-search" ref={container}>
    <input
      type="search" className="global-search-input" value={query} placeholder="Search…"
      aria-label="Search people, clients, projects, jobs, and candidates"
      onChange={(event) => setQuery(event.target.value)}
      onFocus={() => hits.length > 0 && setOpen(true)}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
    />
    {open && hits.length > 0 && <div className="global-search-results" role="listbox">
      {hits.map((hit) => <Link key={`${hit.kind}-${hit.href}-${hit.label}`} href={hit.href} className="global-search-hit"
        onClick={() => { setOpen(false); setQuery(""); }}>
        <span className="global-search-kind">{hit.kind}</span>
        <span><strong>{hit.label}</strong><span>{hit.sub}</span></span>
      </Link>)}
    </div>}
    {open && query.trim().length >= 2 && hits.length === 0 && <div className="global-search-results">
      <p className="global-search-empty">Nothing found.</p>
    </div>}
  </div>;
}
