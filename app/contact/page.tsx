import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SectionHeading } from "@/components/section-heading";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact Us", description: "Talk to Avenstrix Consulting about your next hire or career move." };

export default function ContactPage() { return <main id="main-content"><section className="page-hero"><div className="site-container"><SectionHeading light eyebrow="Contact Avenstrix" title="Ready to scale your team?"><p>Tell us about your hiring needs and one of our specialists will be in touch.</p></SectionHeading></div></section><section className="section"><div className="site-container grid gap-12 lg:grid-cols-5"><div className="lg:col-span-2"><SectionHeading eyebrow="Let’s Connect" title="Your next great hire starts here."><p>Whether you need a specialist, a senior leader, or an entire project team, we are ready to help.</p></SectionHeading><dl className="contact-details"><div><dt>Email</dt><dd><a href={`mailto:${site.email}`}>{site.email}</a></dd></div><div><dt>Phone</dt><dd><a href={`tel:${site.phone.replace(/[^+\d]/g, "")}`}>{site.phone}</a></dd></div><div><dt>Office</dt><dd>{site.address.map((line) => <span className="block" key={line}>{line}</span>)}</dd></div></dl></div><div className="lg:col-span-3 rounded-3xl border border-slate-100 bg-slate-50 p-7 shadow-sm sm:p-10"><ContactForm /></div></div></section></main>; }
