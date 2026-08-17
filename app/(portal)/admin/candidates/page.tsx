import { GlobalCandidatesTable, type GlobalCandidateRow } from "@/components/admin/global-candidates-table";
import { can, requirePermission } from "@/lib/auth/guard";
import { resourceTypeOf } from "@/lib/ats/resource-type";
import { db } from "@/lib/db";

export const metadata = { title: "Global Candidates — Admin" };

export default async function AdminGlobalCandidatesPage() {
  const context = await requirePermission("candidate.view");
  const canManage = can(context, "candidate.manage");

  const candidates = await db.candidate.findMany({
    where: { source: "Global Visa Resource" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const rows: GlobalCandidateRow[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    ssn: c.ssn ?? "",
    visaType: c.visaType ?? "",
    visaStatus: c.visaStatus ?? "",
    visaExpiry: c.visaExpiry ? c.visaExpiry.toISOString().split("T")[0] : null,
    address: c.address ?? "",
    location: c.location ?? "",
    commissionPaid: c.commissionPaid ?? 0,
    techStack: c.techStack ?? c.skills ?? "",
    benchStatus: c.benchStatus ?? "Available / On Bench",
    resourceType: resourceTypeOf(c.source),
    status: c.status,
    canEdit: canManage,
  }));

  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;

  return (
    <section className="portal-section">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="portal-section-title">Global Candidates</h2>
          <p className="portal-note">
            Full talent database records including visa status, SSN details, and commission history
            ({activeCount} active of {rows.length} records).
          </p>
        </div>
      </div>

      <GlobalCandidatesTable candidates={rows} canManage={canManage} />
    </section>
  );
}
