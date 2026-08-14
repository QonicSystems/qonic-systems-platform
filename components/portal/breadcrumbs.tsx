import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * Trail above a portal page title. The final crumb is the current page and is
 * rendered as plain text with aria-current, never as a link to itself.
 */
export function Breadcrumbs({ items }: { items: ReadonlyArray<Crumb> }) {
  if (items.length === 0) return null;

  return <nav className="crumbs" aria-label="Breadcrumb">
    <ol>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return <li key={`${item.label}-${index}`}>
          {item.href && !last
            ? <Link href={item.href}>{item.label}</Link>
            : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
          {/* Decorative: the list structure already conveys the nesting. */}
          {!last && <span className="crumb-sep" aria-hidden="true">›</span>}
        </li>;
      })}
    </ol>
  </nav>;
}
