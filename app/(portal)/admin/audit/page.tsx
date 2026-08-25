import { AuditTable } from "@/components/admin/audit-table";
import { PurgeAudit } from "@/components/admin/purge-audit";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;

/**
 * The log was previously the 100 newest rows with no filters and no way to
 * reach anything older — for a compliance record, "we cannot show you what
 * happened last month" is the wrong answer. Filters and paging are applied in
 * the query so the page stays server-rendered.
 */
export default async function AuditPage({ searchParams }: {
  searchParams: Promise<{ actor?: string; action?: string; from?: string; to?: string; page?: string }>;
}) {
  const context = await requirePermission("audit.view");
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const actorId = params.actor?.trim() || undefined;
  const action = params.action?.trim() || undefined;
  const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const from = isDate(params.from) ? new Date(`${params.from}T00:00:00.000Z`) : undefined;
  // Inclusive of the chosen day, which is what a person picking a date means.
  const to = isDate(params.to) ? new Date(`${params.to}T23:59:59.999Z`) : undefined;

  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [entries, matching, total, actors, actions] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.auditLog.count(),
    // Only people who actually appear in the log — a filter listing names with
    // nothing behind them is just a dead end.
    db.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const now = new Date().getTime();
  const dayOptions = [0, 7, 14, 30, 90, 180, 365];
  const counts = await Promise.all(dayOptions.map((days) =>
    days === 0
      ? db.auditLog.count()
      : db.auditLog.count({ where: { createdAt: { lt: new Date(now - days * 86_400_000) } } })));
  const olderThanOptions = dayOptions.map((days, index) => ({ days, count: counts[index] }));

  return <section className="portal-section">
    <h2 className="portal-section-title">Audit log</h2>
    <p className="portal-note">
      {matching.toLocaleString()} matching {matching === 1 ? "entry" : "entries"}
      {matching !== total && ` of ${total.toLocaleString()}`}. Every privileged action is recorded and cannot be edited.
    </p>

    <AuditTable
      entries={entries.map((entry) => ({
        id: entry.id,
        when: entry.createdAt.toISOString(),
        actor: entry.actor?.name ?? "—",
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        before: entry.before ? JSON.stringify(entry.before, null, 2) : null,
        after: entry.after ? JSON.stringify(entry.after, null, 2) : null,
      }))}
      actors={actors}
      actions={actions.map((entry) => entry.action)}
      filters={{ actor: actorId ?? "", action: action ?? "", from: params.from ?? "", to: params.to ?? "" }}
      page={page}
      pageCount={Math.max(1, Math.ceil(matching / PAGE_SIZE))}
      canExport={can(context, "audit.export")}
    />

    {context.role.isSuperAdmin && can(context, "audit.purge") && <PurgeAudit olderThanOptions={olderThanOptions} totalEntries={total} />}
  </section>;
}
