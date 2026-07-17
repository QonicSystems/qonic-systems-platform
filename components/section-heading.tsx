import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <div className="max-w-2xl">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="section-title">{title}</h1>{children && <div className="mt-5 text-lg leading-8 text-ink-muted">{children}</div>}</div>;
}
