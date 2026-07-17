import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, children, light = false }: { eyebrow?: string; title: string; children?: ReactNode; light?: boolean }) {
  return <div className="max-w-2xl"><p className={light ? "eyebrow eyebrow-light" : "eyebrow"}>{eyebrow}</p><h1 className={light ? "section-title section-title-light" : "section-title"}>{title}</h1>{children && <div className={light ? "mt-5 text-lg leading-8 text-slate-300" : "mt-5 text-lg leading-8 text-slate-body"}>{children}</div>}</div>;
}
