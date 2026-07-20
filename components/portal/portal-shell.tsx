"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLockup } from "@/components/brand";
import { Avatar } from "@/components/portal/avatar";
import { GlobalSearch } from "@/components/portal/global-search";
import { isGroup, type NavGroup, type NavItem } from "@/lib/portal-nav";

export type PortalUser = { name: string; email: string; roleLabel: string; photoUrl: string | null };


export function PortalShell({ user, links, unreadCount, children }: {
  user: PortalUser;
  /** Resolved on the server so the bell is correct on first paint. */
  unreadCount: number;
  /** Already filtered by permission on the server — this component never decides access. */
  links: ReadonlyArray<NavItem | NavGroup>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close the compact menu on navigation, otherwise it stays open over the new page.
  const closeMenu = () => setMenuOpen(false);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return <div className="portal">
    <header className="portal-bar">
      <div className="portal-bar-inner">
        <Link href="/dashboard" className="brand"><BrandLockup /></Link>

        <nav className="portal-nav" aria-label="Portal navigation">
          {links.map((entry) => isGroup(entry)
            ? <NavDropdown key={entry.label} group={entry} pathname={pathname} />
            : <NavLink key={entry.href} item={entry} pathname={pathname} />)}
        </nav>

        <div className="portal-account">
          <button
            type="button"
            className={`portal-burger ${menuOpen ? "is-open" : ""}`}
            aria-expanded={menuOpen}
            aria-controls="portal-menu"
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen((value) => !value)}
          ><span /><span /><span /></button>
          <GlobalSearch />
          <Link href="/notifications" className="portal-bell" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}>
            <span aria-hidden="true">🔔</span>
            {unreadCount > 0 && <span className="portal-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </Link>
          <button type="button" className="portal-avatar-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu">
            <Avatar name={user.name} photoUrl={user.photoUrl} size={40} />
          </button>
          {open && <div className="portal-menu" role="menu">
            <div className="portal-menu-head">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <span className="portal-role-chip">{user.roleLabel}</span>
            </div>
            <Link href="/profile" className="portal-menu-item" role="menuitem" onClick={() => setOpen(false)}>My Profile</Link>
            <Link href="/profile/security" className="portal-menu-item" role="menuitem" onClick={() => setOpen(false)}>Change Password</Link>
            <button type="button" className="portal-menu-item portal-menu-item--danger" role="menuitem" onClick={signOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>}
        </div>
      </div>

      {/* Below the desktop breakpoint the horizontal nav is hidden, so this is
          the ONLY way to reach the rest of the portal on a narrow screen. */}
      <div id="portal-menu" className={`portal-drawer ${menuOpen ? "is-open" : ""}`}>
        <div className="portal-drawer-inner">
          {links.map((entry) => isGroup(entry)
            ? <div key={entry.label} className="portal-drawer-group">
                <p className="portal-drawer-heading">{entry.label}</p>
                {entry.items.map((item) => <Link key={item.href} href={item.href}
                  className={`portal-drawer-link ${isActive(item.href, pathname) ? "is-active" : ""}`}
                  onClick={closeMenu}>{item.label}</Link>)}
              </div>
            : <Link key={entry.href} href={entry.href}
                className={`portal-drawer-link ${isActive(entry.href, pathname) ? "is-active" : ""}`}
                onClick={closeMenu}>{entry.label}</Link>)}
        </div>
      </div>
    </header>

    <main id="main-content" className="portal-main">{children}</main>
  </div>;
}

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item.href, pathname);
  return <Link href={item.href} className={`portal-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
}

/**
 * Click to open, click again or click away to close.
 *
 * An earlier version also opened on hover, which made it impossible to click one
 * open with a mouse: mouseenter set it open, then the click toggled it straight
 * back shut. Click-only is unambiguous and works identically for pointer, touch,
 * and keyboard, so there is no state for the two interactions to fight over.
 */
function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const active = group.items.some((item) => isActive(item.href, pathname));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div className="portal-group" ref={container}>
    <button
      type="button"
      className={`portal-link portal-group-trigger ${active ? "is-active" : ""}`}
      aria-expanded={open}
      aria-haspopup="true"
      onClick={() => setOpen((value) => !value)}
    >
      {group.label}
      <span className="portal-caret" aria-hidden="true" />
    </button>
    {open && <div className="portal-dropdown" role="menu">
      {group.items.map((item) => <Link
        key={item.href}
        href={item.href}
        role="menuitem"
        className={`portal-dropdown-item ${isActive(item.href, pathname) ? "is-active" : ""}`}
        onClick={() => setOpen(false)}
      >{item.label}</Link>)}
    </div>}
  </div>;
}
