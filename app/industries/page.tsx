import type { Metadata } from "next";
import { IndustryGrid } from "@/components/industry-grid";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = { title: "Industries", description: "Specialist recruitment for technology, life sciences, medical devices, and corporate functions." };
export default function IndustriesPage() { return <main id="main-content"><section className="page-hero"><div className="site-container"><SectionHeading light eyebrow="Industry Expertise" title="Specialized knowledge for the markets that matter."><p>Our focused practices combine a broad talent network with the context to identify candidates who can make an immediate impact.</p></SectionHeading></div></section><section className="section section-muted"><div className="site-container"><IndustryGrid /></div></section></main>; }
