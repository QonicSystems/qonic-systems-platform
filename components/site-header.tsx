"use client";

import { useEffect, useState } from "react";
import { navigation, site } from "@/lib/site";
import { LogoMark } from "@/components/icons";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <header className={`site-header ${scrolled ? "site-header--scrolled" : ""}`}>
      <nav className="site-container flex items-center justify-between" aria-label="Primary navigation">
        <a href="/" className="brand" aria-label={`${site.name} — Home`}>
          <span className="brand-mark"><LogoMark /></span>
          <span>Avenstrix<span>Consulting</span></span>
        </a>
        <div className="hidden items-center gap-1 lg:flex">
          {navigation.map(([label, href]) => <a key={href} href={href} className="nav-link">{label}</a>)}
        </div>
        <div className="flex items-center gap-3">
          {/* Staff entry point. Deliberately a quiet text link, not a second
              button — it must not compete with the visitor-facing CTA. */}
          <a href="/login" className="staff-link">Sign In</a>
          <a href="/contact" className="button button-primary header-cta">Let&apos;s Talk</a>
          <button type="button" className={`menu-toggle lg:hidden ${open ? "is-open" : ""}`} aria-expanded={open} aria-controls="mobile-menu" aria-label="Toggle navigation menu" onClick={() => setOpen((current) => !current)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>
      <div id="mobile-menu" className={`mobile-menu lg:hidden ${open ? "is-open" : ""}`}>
        <div className="site-container space-y-1 py-4">
          {navigation.map(([label, href]) => <a key={href} href={href} className="mobile-link" onClick={() => setOpen(false)}>{label}</a>)}
          <a href="/login" className="mobile-link mobile-link--staff" onClick={() => setOpen(false)}>Sign In to the staff portal</a>
          <a href="/contact" className="button button-primary mt-3 w-full" onClick={() => setOpen(false)}>Let&apos;s Talk</a>
        </div>
      </div>
    </header>
  );
}
