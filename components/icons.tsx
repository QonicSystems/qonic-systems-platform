import type { ReactNode } from "react";

export function ArrowRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m17 8 4 4m0 0-4 4m4-4H3" /></svg>;
}

export function IndustryIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
    flask: <><path d="M9 3h6M10 3v6l-5.4 8.4A2.5 2.5 0 0 0 6.7 21h10.6a2.5 2.5 0 0 0 2.1-3.6L14 9V3" /><path d="M8.5 15h7" /></>,
    dna: <><path d="M4 4c8 0 8 16 16 16M20 4C12 4 12 20 4 20M6 7h12M6 17h12" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
