import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Audit Log" };

export default async function AuditPage() {
  await requirePermission("audit.view");

  const entries = await db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 100 });

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
  </section>;
}
