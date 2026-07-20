"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/icons";
import { Avatar } from "@/components/portal/avatar";

export type PortalUser = { name: string; email: string; roleLabel: string; photoUrl: string | null };

export function PortalShell({ user, links, children }: {
  user: PortalUser;
  /** Already filtered by permission on the server — this component never decides access. */
  links: ReadonlyArray<{ label: string; href: string }>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return <div className="portal">
    <header className="portal-bar">
      <div className="portal-bar-inner">
        <Link href="/dashboard" className="brand"><span className="brand-mark"><LogoMark /></span><span>Avenstrix<span>Consulting</span></span></Link>

        <nav className="portal-nav" aria-label="Portal navigation">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return <Link key={link.href} href={link.href} className={`portal-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>{link.label}</Link>;
          })}
        </nav>

        <div className="portal-account">
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
    </header>

    <main id="main-content" className="portal-main">{children}</main>
  </div>;
}
