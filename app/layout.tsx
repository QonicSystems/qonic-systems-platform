import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Poppins, Sulphur_Point } from "next/font/google";
import "@/app/globals.css";
import { site } from "@/lib/site";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display" });

// Brand faces. Poppins stands in for Quantify, which is not distributed on
// Google Fonts — the geometric proportions are close but the letterforms are
// NOT identical. Sulphur Point is the genuine tagline face.
const wordmark = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-wordmark" });
const tagline = Sulphur_Point({ subsets: ["latin"], weight: ["300", "400", "700"], variable: "--font-tagline" });

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, title: `${site.name} — ${site.description}`, description: site.description },
};

// Chrome-free shell. The public header/footer live in app/(marketing)/layout.tsx
// so the authenticated portal and login page can present their own.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${body.variable} ${display.variable} ${wordmark.variable} ${tagline.variable}`}>
    <head><noscript><style>{`.reveal{opacity:1!important;transform:none!important}`}</style></noscript></head>
    <body>{children}</body>
  </html>;
}
