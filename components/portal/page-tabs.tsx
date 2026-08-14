"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PageTab = { label: string; href: string };

/**
 * The horizontal tab row under a portal page title.
 *
 * A client component purely so it can read the pathname: the admin tabs were
 * rendered by a server layout, which cannot, so no tab was ever marked active
 * and the current section was visually indistinguishable from the others.
 *
 * Matching is exact on purpose. Prefix matching (as the top nav uses) would
 * light up "/dashboard" for every child route, so the first tab would always
 * read as active alongside the real one.
 */
export function PageTabs({ tabs, label }: { tabs: ReadonlyArray<PageTab>; label: string }) {
  const pathname = usePathname();
  if (tabs.length < 2) return null;

  return <nav className="page-tabs" aria-label={label}>
    {tabs.map((tab) => {
      const active = pathname === tab.href;
      return <Link
        key={tab.href}
        href={tab.href}
        className={`page-tab${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >{tab.label}</Link>;
    })}
  </nav>;
}
