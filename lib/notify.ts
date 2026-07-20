import { db } from "@/lib/db";
import type { NotificationKind } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
};

/**
 * Writes an in-app notification.
 *
 * Pass the transaction client so the notification commits with the event it
 * describes — otherwise a rolled-back approval could still tell someone their
 * leave was approved.
 */
export async function notify(entry: NotifyInput, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await client.notification.create({
    data: { userId: entry.userId, kind: entry.kind, title: entry.title, body: entry.body ?? null, link: entry.link ?? null },
  });
}

/** Fan-out to several people, e.g. every approver of a submitted timesheet. */
export async function notifyMany(userIds: ReadonlyArray<string>, entry: Omit<NotifyInput, "userId">, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await client.notification.createMany({
    data: unique.map((userId) => ({ userId, kind: entry.kind, title: entry.title, body: entry.body ?? null, link: entry.link ?? null })),
  });
}
