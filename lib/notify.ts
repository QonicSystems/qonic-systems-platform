import nodemailer from "nodemailer";
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

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 1025;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.CONTACT_FROM_EMAIL || "notifications@qonicsystems.com";

  if (!host) return null;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
    from,
  };
}

async function sendNotificationEmails(
  recipients: ReadonlyArray<string>,
  title: string,
  body?: string | null,
  link?: string | null
): Promise<void> {
  const config = getSmtpConfig();
  if (!config || recipients.length === 0) return;

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    const fullLink = link
      ? link.startsWith("http")
        ? link
        : `https://consulting.qonicsystems.com${link}`
      : "";
    const emailText = `${title}\n\n${body ?? ""}\n\n${fullLink ? `View details: ${fullLink}` : ""}\n\n— Qonic Systems Platform`;

    for (const email of recipients) {
      if (!email || !email.includes("@")) continue;
      await transporter
        .sendMail({
          from: config.from,
          to: email,
          subject: `[Qonic Systems] ${title}`,
          text: emailText,
        })
        .catch((err) => {
          console.error(`[notification-email] Failed to dispatch email to ${email}:`, err);
        });
    }
  } catch (err) {
    console.error("[notification-email] SMTP transport error:", err);
  }
}

/**
 * Writes an in-app notification and dispatches an email to the recipient.
 */
export async function notify(
  entry: NotifyInput,
  client: Prisma.TransactionClient | typeof db = db
): Promise<void> {
  await client.notification.create({
    data: {
      userId: entry.userId,
      kind: entry.kind,
      title: entry.title,
      body: entry.body ?? null,
      link: entry.link ?? null,
    },
  });

  const user = await (client as typeof db).user.findUnique({
    where: { id: entry.userId },
    select: { email: true },
  });

  if (user?.email) {
    void sendNotificationEmails([user.email], entry.title, entry.body, entry.link);
  }
}

/**
 * Fan-out in-app notifications and emails to multiple users.
 */
export async function notifyMany(
  userIds: ReadonlyArray<string>,
  entry: Omit<NotifyInput, "userId">,
  client: Prisma.TransactionClient | typeof db = db
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  await client.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      kind: entry.kind,
      title: entry.title,
      body: entry.body ?? null,
      link: entry.link ?? null,
    })),
  });

  const users = await (client as typeof db).user.findMany({
    where: { id: { in: unique } },
    select: { email: true },
  });

  const emails = users.map((u) => u.email).filter(Boolean);
  if (emails.length > 0) {
    void sendNotificationEmails(emails, entry.title, entry.body, entry.link);
  }
}

/**
 * Dual Leadership Notification:
 * Automatically dispatches both an in-app alert AND an email to BOTH Founder (CEO) and Co-Founder.
 */
export async function notifyLeadership(
  entry: Omit<NotifyInput, "userId">,
  client: Prisma.TransactionClient | typeof db = db
): Promise<void> {
  const leaders = await (client as typeof db).user.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { in: ["ceo", "co_founder"] } },
    },
    select: { id: true, email: true },
  });

  const ids = leaders.map((l) => l.id);
  if (ids.length > 0) {
    await notifyMany(ids, entry, client);
  }
}

