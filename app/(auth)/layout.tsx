import Link from "next/link";
import { LogoMark } from "@/components/icons";

// Deliberately chrome-free: no marketing nav or footer, so nothing distracts
// from the single sign-in task and no public links leak into the auth flow.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main id="main-content" className="auth-shell">
    <div className="auth-aurora" aria-hidden="true" />
    <div className="auth-card">
      <Link href="/" className="brand mb-8"><span className="brand-mark"><LogoMark /></span><span>Avenstrix<span>Consulting</span></span></Link>
      {children}
    </div>
    <p className="auth-footnote">© {new Date().getFullYear()} Avenstrix Consulting · <Link href="/">Back to website</Link></p>
  </main>;
}
