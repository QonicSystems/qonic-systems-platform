import { processSteps } from "@/lib/site";

export function ProcessSteps() {
  return <ol className="grid gap-8 md:grid-cols-3">{processSteps.map(([number, title, copy]) => <li key={number} className="process-card"><span>{number}</span><h2>{title}</h2><p>{copy}</p></li>)}</ol>;
}
