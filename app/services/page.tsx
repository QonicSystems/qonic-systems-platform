import type { Metadata } from "next";
import { ProcessSteps } from "@/components/process-steps";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = { title: "Services", description: "Avenstrix Consulting delivers tailored recruitment and talent solutions." };
export default function ServicesPage() { return <main id="main-content"><section className="page-hero"><div className="site-container"><SectionHeading light eyebrow="Talent Solutions" title="A deliberate search process, tailored to your goals."><p>From a critical specialist hire to a growing team, we bring clarity, pace, and precision to every mandate.</p></SectionHeading></div></section><section className="section"><div className="site-container"><SectionHeading eyebrow="Our Process" title="A partnership from brief to beyond the start date."><p>We use a structured, transparent approach designed around the capabilities and culture that will make your organization stronger.</p></SectionHeading><div className="mt-12"><ProcessSteps /></div></div></section></main>; }
