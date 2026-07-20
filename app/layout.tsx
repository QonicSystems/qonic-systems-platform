import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";
import { site } from "@/lib/site";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://avenstrixconsulting.com"),
  title: { default: "Avenstrix Consulting | Talent Solutions & Consulting", template: "%s | Avenstrix Consulting" },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, title: "Avenstrix Consulting — Connecting Talent. Creating Tomorrow.", description: site.description },
};

// Chrome-free shell. The public header/footer live in app/(marketing)/layout.tsx
// so the authenticated portal and login page can present their own.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${body.variable} ${display.variable}`}>
    <head><noscript><style>{`.reveal{opacity:1!important;transform:none!important}`}</style></noscript></head>
    <body>{children}</body>
  </html>;
}
