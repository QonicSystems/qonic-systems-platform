"use client";

import { useEffect, useRef, useState } from "react";

const stats = [[850, "+", "Successful Placements"], [120, "+", "Enterprise Clients"], [5, "", "Industry Verticals"], [96, "%", "Client Retention Rate"]] as const;

function Counter({ target }: { target: number }) {
  const reference = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const element = reference.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const start = performance.now();
      const tick = (now: number) => { const progress = Math.min((now - start) / 1200, 1); setValue(Math.floor(target * (1 - (1 - progress) ** 3))); if (progress < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element); return () => observer.disconnect();
  }, [target]);
  return <span ref={reference}>{value.toLocaleString()}</span>;
}

export function Stats() {
  return <section className="border-b border-slate-100 bg-white" aria-label="Company statistics"><div className="site-container grid grid-cols-2 gap-8 py-14 md:grid-cols-4">{stats.map(([target, suffix, label]) => <div key={label} className="stat"><strong><Counter target={target} />{suffix}</strong><p>{label}</p></div>)}</div></section>;
}
