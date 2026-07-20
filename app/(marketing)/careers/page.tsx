import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles at Avenstrix Consulting and with the clients we recruit for.",
};

// Published roles change through the day, so this page is always current.
export const dynamic = "force-dynamic";

export default async function CareersPage() {
  const jobs = await db.job.findMany({
    where: { isPublished: true, status: "OPEN" },
    include: { client: { select: { industry: true } } },
    orderBy: { createdAt: "desc" },
  });

  return <main id="main-content">
    <section className="page-hero">
      <div className="hero-grid" aria-hidden="true" /><div className="aurora aurora--one" aria-hidden="true" />
      <div className="site-container relative"><div className="hero-in">
        <SectionHeading eyebrow="Careers" title="Roles we are hiring for right now.">
          <p>We recruit across technology, life sciences, and corporate functions. If nothing here fits, we would still like to hear from you.</p>
        </SectionHeading>
      </div></div>
    </section>

    <section className="section">
      <div className="site-container">
        {jobs.length === 0 ? <Reveal>
          <p className="portal-note">
            There are no published vacancies at the moment. Please <Link className="text-link" href="/contact">get in touch</Link> and we will let you know when something suitable opens.
          </p>
        </Reveal> : <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job, index) => <Reveal key={job.id} delay={index * 80}>
            <article className="industry-card h-full">
              <p className="eyebrow">{job.client.industry ?? "Consulting"}</p>
              <h2>{job.title}</h2>
              <p>
                {[job.location, job.employmentType].filter(Boolean).join(" · ")}
                {job.salaryMin && job.salaryMax ? ` · ${formatMoney(job.salaryMin, job.currency)} – ${formatMoney(job.salaryMax, job.currency)}` : ""}
              </p>
              <Link className="card-link" href={`/careers/${job.id}`}>View role and apply <span aria-hidden="true">→</span></Link>
            </article>
          </Reveal>)}
        </div>}
      </div>
    </section>
  </main>;
}
