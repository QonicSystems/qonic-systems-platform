import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/careers/apply-form";
import { SectionHeading } from "@/components/section-heading";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = await db.job.findUnique({ where: { id: (await params).id } });
  // An unpublished role must not be discoverable, so give it no metadata.
  return job?.isPublished ? { title: job.title, description: job.description?.slice(0, 160) } : { title: "Role not found" };
}

export default async function CareerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id }, include: { client: { select: { industry: true } } } });

  // Only OPEN + published roles are visible publicly — a draft requisition the
  // client has not signed off must never leak.
  if (!job || !job.isPublished || job.status !== "OPEN") notFound();

  return <main id="main-content">
    <section className="page-hero">
      <div className="hero-grid" aria-hidden="true" /><div className="aurora aurora--one" aria-hidden="true" />
      <div className="site-container relative"><div className="hero-in">
        <SectionHeading eyebrow={job.client.industry ?? "Consulting"} title={job.title}>
          <p>
            {[job.location, job.employmentType].filter(Boolean).join(" · ")}
            {job.salaryMin && job.salaryMax ? ` · ${formatMoney(job.salaryMin, job.currency)} – ${formatMoney(job.salaryMax, job.currency)}` : ""}
          </p>
        </SectionHeading>
      </div></div>
    </section>

    <section className="section">
      <div className="site-container grid items-start gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3 prose-copy">
          <h2>About the role</h2>
          <p>{job.description || "Full details are available on request — apply and one of our consultants will be in touch."}</p>
          <p className="portal-muted">Reference {job.reference}</p>
        </div>
        <div className="lg:col-span-2">
          <div className="contact-panel p-7 sm:p-9">
            <h2 className="portal-section-title">Apply</h2>
            <ApplyForm jobId={job.id} />
          </div>
        </div>
      </div>
    </section>

    <p className="site-container pb-16"><Link className="text-link" href="/careers">All open roles</Link></p>
  </main>;
}
