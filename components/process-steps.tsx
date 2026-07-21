import { Reveal } from "@/components/reveal";
import { processSteps } from "@/lib/site";

export function ProcessSteps() {
  return <ol className="grid gap-8 md:grid-cols-3">{processSteps.map(([number, title, copy], index) => <Reveal key={number} as="li" delay={index * 120}><div className="process-card h-full"><span>{number}</span><h2>{title}</h2><p>{copy}</p></div></Reveal>)}</ol>;
}
