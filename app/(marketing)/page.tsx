import { ArrowRight, IndustryIcon } from "@/components/icons";
import { IndustryGrid } from "@/components/industry-grid";
import { ProcessSteps } from "@/components/process-steps";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Stats } from "@/components/stats";
import { TestimonialCarousel } from "@/components/testimonial-carousel";

const clients = ["TechFlow Solutions", "MedTech Innovators", "NovaBio Therapeutics", "GlobalPharma Inc.", "Helix Biosciences", "Northwind Corporate"];

export default function HomePage() {
  return <main id="main-content">
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="aurora aurora--one" aria-hidden="true" />
      <div className="aurora aurora--two" aria-hidden="true" />
      <div className="site-container relative grid items-center gap-14 py-32 lg:min-h-screen lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="hero-pill hero-in"><span />Talent &amp; Consulting Solutions</p>
          <h1 className="hero-in" style={{ "--reveal-delay": "90ms" } as React.CSSProperties}>Connecting Talent. <span>Creating Tomorrow.</span></h1>
          <p className="hero-copy hero-in" style={{ "--reveal-delay": "180ms" } as React.CSSProperties}>We help ambitious companies and professionals connect with opportunity, insight, and lasting impact.</p>
          <div className="hero-in flex flex-wrap gap-4" style={{ "--reveal-delay": "270ms" } as React.CSSProperties}>
            <a href="/contact" className="button button-primary button-large">Start a Conversation <ArrowRight /></a>
            <a href="/industries" className="button button-outline button-large">Explore Services</a>
          </div>
        </div>
        <div className="hero-in relative" style={{ "--reveal-delay": "360ms" } as React.CSSProperties}>
          <div className="network-visual" aria-hidden="true">
            <span className="float-card float-card--a"><i><IndustryIcon name="code" /></i><span><strong>850+</strong><small>Placements made</small></span></span>
            <span className="float-card float-card--b"><i><IndustryIcon name="heart" /></i><span><strong>96%</strong><small>Client retention</small></span></span>
            <svg viewBox="0 0 500 500" fill="none">
              <path d="m250 100 150 100-50 150-100 70-100-70-50-150 150-100Zm0 150 100-50m-100 50-100-50m100 0v-150m0 150-100 100m100-100 100 100" />
              <circle cx="250" cy="100" r="30" /><circle cx="100" cy="200" r="33" /><circle cx="400" cy="200" r="33" /><circle cx="250" cy="250" r="38" /><circle cx="150" cy="350" r="33" /><circle cx="350" cy="350" r="29" /><circle cx="250" cy="420" r="31" />
              <text x="250" y="105">IT</text><text x="100" y="205">Pharma</text><text x="400" y="205">Biotech</text><text x="250" y="256">AVX</text><text x="150" y="355">Devices</text><text x="350" y="355">Corp</text><text x="250" y="426">Talent</text>
            </svg>
          </div>
        </div>
        <div className="hero-in lg:col-span-2" style={{ "--reveal-delay": "450ms" } as React.CSSProperties}>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.18em] text-ink-faint">Trusted by industry leaders</p>
          <div className="marquee">
            <div className="marquee-track" aria-label="Client organizations">
              {[...clients, ...clients].map((name, index) => <span key={`${name}-${index}`} aria-hidden={index >= clients.length}>{name}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>

    <Stats />

    <section className="section">
      <div className="site-container grid items-center gap-14 lg:grid-cols-2">
        <Reveal className="about-panel"><div><strong>15+ Years</strong><p>of Strategic Partnership</p></div></Reveal>
        <Reveal delay={120}>
          <SectionHeading eyebrow="About Avenstrix" title="The right connection changes everything.">
            <p>We are a specialist consulting partner built around a simple belief: exceptional people deserve exceptional opportunities.</p>
          </SectionHeading>
          <ul className="check-list"><li>Deep sector expertise</li><li>Global reach, personal approach</li><li>Long-term partnerships</li></ul>
          <a className="text-link" href="/about">Meet Avenstrix Consulting <ArrowRight /></a>
        </Reveal>
      </div>
    </section>

    <section className="section section-muted">
      <div className="site-container">
        <Reveal>
          <SectionHeading eyebrow="Our Industries" title="Specialized Talent for Specialized Sectors">
            <p>Our focused teams understand the skills, regulations, and business dynamics that shape your industry.</p>
          </SectionHeading>
        </Reveal>
        <div className="mt-12"><IndustryGrid /></div>
      </div>
    </section>

    <section className="section">
      <div className="site-container">
        <Reveal>
          <SectionHeading eyebrow="How We Work" title="A Process Built for Precision">
            <p>Every search is carefully tailored, transparent, and driven by the outcomes that matter to you.</p>
          </SectionHeading>
        </Reveal>
        <div className="mt-12"><ProcessSteps /></div>
      </div>
    </section>

    <section id="testimonials" className="section testimonials">
      <div className="site-container">
        <Reveal>
          <SectionHeading eyebrow="Client Stories" title="Trusted Partnerships. Measurable Impact.">
            <p>See why ambitious organizations choose Avenstrix for their most important hires.</p>
          </SectionHeading>
        </Reveal>
        <div className="mx-auto mt-12 max-w-3xl"><TestimonialCarousel /></div>
      </div>
    </section>

    <section className="cta">
      <div className="site-container flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
        <Reveal><p className="eyebrow eyebrow-light">Ready when you are</p><h2>Build the team that moves your business forward.</h2></Reveal>
        <Reveal delay={120}><a href="/contact" className="button button-white button-large">Start a Conversation <ArrowRight /></a></Reveal>
      </div>
    </section>
  </main>;
}
