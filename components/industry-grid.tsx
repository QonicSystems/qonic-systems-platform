import { IndustryIcon } from "@/components/icons";
import { industries } from "@/lib/site";

export function IndustryGrid() {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{industries.map((industry) => <article key={industry.title} className="industry-card"><span className="industry-icon"><IndustryIcon name={industry.icon} /></span><h2>{industry.title}</h2><p>{industry.copy}</p><a href="/contact" className="card-link">Build your team <span aria-hidden="true">→</span></a></article>)}</div>;
}
