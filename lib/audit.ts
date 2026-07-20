import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

/**
 * Records a privileged action. Every RBAC and account mutation writes one of
 * these — the permission matrix is exactly the surface where a quiet malicious
 * change would be most damaging and hardest to notice.
 *
 * Pass a transaction client when the audit row must commit atomically with the
 * change it describes.
 */
export async function recordAudit(entry: AuditEntry, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/** Best-effort client IP from the proxy headers. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
