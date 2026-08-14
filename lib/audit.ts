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

/**
 * Best-effort client IP from the proxy headers.
 *
 * Takes the RIGHTMOST entry of x-forwarded-for, not the leftmost. Any client
 * can send their own x-forwarded-for and our proxy appends to it, so the left
 * of the list is whatever the caller invented — reading it let anyone forge the
 * IP recorded against auth.login.failed, user.delete or audit.purge. The last
 * hop is the one our own edge wrote, so it is the only one we can trust.
 *
 * Vercel's own x-vercel-forwarded-for is preferred where present: it is set by
 * the platform and cannot be spoofed.
 */
export function clientIp(request: Request): string | null {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip");
}
