import type { Metadata } from "next";
import { ArrowRight } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = { title: "About Us", description: "Learn how QONIC consulting creates exceptional recruitment partnerships." };

export default function AboutPage() {
  return <main id="main-content">
    <section className="page-hero">
      <div className="hero-grid" aria-hidden="true" /><div className="aurora aurora--one" aria-hidden="true" />
      <div className="site-container relative"><div className="hero-in"><SectionHeading eyebrow="About QONIC" title="Recruitment excellence, built on genuine partnership."><p>For more than 15 years, QONIC consulting has connected high-impact organizations with the people who help them grow.</p></SectionHeading></div></div>
    </section>
    <section className="section">
      <div className="site-container grid items-start gap-12 lg:grid-cols-2">
        <Reveal><SectionHeading eyebrow="Our Approach" title="People-first. Results-driven."><p>We pair deep market knowledge with a human approach. Our consultants listen carefully, challenge thoughtfully, and make introductions that create enduring value.</p></SectionHeading></Reveal>
        <Reveal delay={120}><div className="rounded-3xl border border-canvas-line bg-white p-9 text-ink-muted shadow-[var(--shadow-md)]"><h2 className="font-display text-2xl font-extrabold text-ink">What clients count on</h2><ul className="check-list"><li>Specialist recruiters who know your market</li><li>Rigorous, considered candidate evaluation</li><li>Clear communication from brief through onboarding</li><li>Partnerships designed to last</li></ul></div></Reveal>
      </div>
    </section>
    <section className="cta"><div className="site-container flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center"><Reveal><h2>Let&apos;s build what&apos;s next.</h2></Reveal><Reveal delay={120}><a href="/contact" className="button button-white button-large">Work with us <ArrowRight /></a></Reveal></div></section>
  </main>;
}
