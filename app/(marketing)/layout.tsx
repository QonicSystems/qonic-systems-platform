import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

// Public-site chrome. Route groups do not affect URLs, so every marketing path
// is unchanged — only which layout wraps it.
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <SiteHeader />
    {children}
    <Footer />
  </>;
}
