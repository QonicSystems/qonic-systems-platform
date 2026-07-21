import { PurgeAudit } from "@/components/admin/purge-audit";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Audit Log" };

export default async function AuditPage() {
  const context = await requirePermission("audit.view");
  const entries = await db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 100 });

  // How much each retention window would remove, so the dialog can state the
  // real consequence rather than a vague warning.
  const now = new Date().getTime();
  const [total, ...counts] = await Promise.all([
    db.auditLog.count(),
    ...[30, 90, 180, 365].map((days) =>
      db.auditLog.count({ where: { createdAt: { lt: new Date(now - days * 86_400_000) } } })),
  ]);
  const olderThanOptions = [30, 90, 180, 365].map((days, index) => ({ days, count: counts[index] }));

  return <section className="portal-section">
    <h2 className="portal-section-title">Audit log</h2>
    <p className="portal-note">The 100 most recent privileged actions.</p>

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={4}>No activity recorded yet.</td></tr>}
          {entries.map((entry) => <tr key={entry.id}>
            <td>{entry.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
            <td>{entry.actor?.name ?? "—"}</td>
            <td><code className="audit-action">{entry.action}</code></td>
            <td>{entry.after ? <code className="audit-detail">{JSON.stringify(entry.after)}</code> : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {context.role.isSuperAdmin && <PurgeAudit olderThanOptions={olderThanOptions} totalEntries={total} />}
  </section>;
}
