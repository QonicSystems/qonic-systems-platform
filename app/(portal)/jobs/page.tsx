import Link from "next/link";
import { JobManager } from "@/components/ats/job-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { jobAgeing } from "@/lib/ats/pipeline";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const context = await requirePermission("job.view");

  const [jobs, clients] = await Promise.all([
    db.job.findMany({
      include: { client: { select: { name: true } }, _count: { select: { applications: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.client.findMany({ where: { status: { in: ["ACTIVE", "PROSPECT"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Recruitment</p>
      <h1 className="portal-title">Jobs</h1>
      <p className="portal-lead">{jobs.length} requisition{jobs.length === 1 ? "" : "s"} on the desk.</p>
    </header>

    <JobManager
      jobs={jobs.map((job) => {
        const { days, overSla } = jobAgeing(job);
        return {
          id: job.id, reference: job.reference, title: job.title, client: job.client.name,
          status: job.status, openings: job.openings, applications: job._count.applications,
          published: job.isPublished, days, overSla,
          band: job.salaryMin && job.salaryMax ? `${formatMoney(job.salaryMin, job.currency)} – ${formatMoney(job.salaryMax, job.currency)}` : "—",
        };
      })}
      clients={clients}
      canManage={can(context, "job.manage")}
    />
  </div>;
}
