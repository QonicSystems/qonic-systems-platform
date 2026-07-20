import { navigation, site } from "@/lib/site";
import { LogoMark } from "@/components/icons";

export function Footer() {
  return <footer className="site-footer">
    <div className="site-container grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
      <div><a href="/" className="brand"><span className="brand-mark"><LogoMark /></span><span>Avenstrix<span>Consulting</span></span></a><p className="mt-6 max-w-xs text-sm leading-7">Connecting talent with visionary organizations and building lasting impact.</p></div>
      <div><h2 className="footer-heading">Company</h2><ul className="space-y-3">{navigation.slice(1).map(([label, href]) => <li key={href}><a className="footer-link" href={href}>{label}</a></li>)}</ul></div>
      <div><h2 className="footer-heading">Industries</h2><ul className="space-y-3">{["Information Technology", "Pharmaceuticals", "Biotechnology", "Medical Devices", "Non-IT & Corporate"].map((name) => <li key={name}><a className="footer-link" href="/industries">{name}</a></li>)}</ul></div>
      <div><h2 className="footer-heading">Contact</h2><ul className="space-y-3 text-sm"><li><a className="footer-link" href={`mailto:${site.email}`}>{site.email}</a></li><li><a className="footer-link" href={`tel:${site.phone.replace(/[^+\d]/g, "")}`}>{site.phone}</a></li><li>{site.address.map((line) => <span key={line} className="block">{line}</span>)}</li></ul></div>
    </div>
    <div className="border-t border-canvas-line"><div className="site-container flex flex-col justify-between gap-4 py-6 text-sm text-ink-faint sm:flex-row"><span>© {new Date().getFullYear()} {site.name}. All Rights Reserved.</span><span className="flex gap-5"><a className="footer-link" href="/privacy">Privacy Policy</a><a className="footer-link" href="/terms">Terms of Service</a><a className="footer-link" href="/login">Staff Sign In</a></span></div></div>
  </footer>;
}
