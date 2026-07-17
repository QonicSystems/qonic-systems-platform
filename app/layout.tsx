import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://avenstrixconsulting.com"),
  title: { default: "Avenstrix Consulting | Talent Solutions & Consulting", template: "%s | Avenstrix Consulting" },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, title: "Avenstrix Consulting — Connecting Talent. Creating Tomorrow.", description: site.description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${body.variable} ${display.variable}`}><body><a className="skip-link" href="#main-content">Skip to main content</a><SiteHeader />{children}<Footer /></body></html>;
}
