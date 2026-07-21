import { IndustryIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { industries } from "@/lib/site";

export function IndustryGrid() {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{industries.map((industry, index) => <Reveal key={industry.title} delay={index * 90}><article className="industry-card h-full"><span className="industry-icon"><IndustryIcon name={industry.icon} /></span><h2>{industry.title}</h2><p>{industry.copy}</p><a href="/contact" className="card-link">Build your team <span aria-hidden="true">→</span></a></article></Reveal>)}</div>;
}
