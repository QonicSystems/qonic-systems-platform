import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/app-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { INVITE_TTL_MS, createResetToken, hashResetToken, inviteEmail, resetUrl } from "@/lib/auth/reset";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function smtp() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_FROM_EMAIL"] as const;
  if (required.some((name) => !process.env[name])) return null;
  return {
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    from: process.env.CONTACT_FROM_EMAIL!,
  };
}

/**
 * Resend a password setup / invitation link to an employee.
 * Allowed as long as the employee must still set their password (mustChangePassword === true).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, response } = await guardRoute("user.manage");
  if (response) return response;

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!user || user.status === "ARCHIVED") {
    return NextResponse.json({ message: "That user no longer exists." }, { status: 404 });
  }

  const authority = canAdminister(context, { id: user.id, role: user.role });
  if (!authority.ok) {
    return NextResponse.json({ message: authority.reason }, { status: authority.status });
  }

  const token = createResetToken();
  const tokenHash = hashResetToken(token);

  await db.$transaction(async (tx) => {
    // Invalidate prior unused tokens
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

    // Create new invite / reset token
    await tx.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    // Ensure mustChangePassword remains true so user chooses password
    await tx.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    await recordAudit(
      {
        actorId: context.user.id,
        action: "user.invite_resend",
        entityType: "User",
        entityId: user.id,
        after: { name: user.name, email: user.email, role: user.role.key },
        ipAddress: clientIp(request),
      },
      tx
    );
  });

  const url = resetUrl(appOrigin(), token);
  const config = smtp();
  let delivered = false;

  if (config) {
    try {
      const { subject, text } = inviteEmail(user.name, url, context.user.name);
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });
      await transporter.sendMail({ from: config.from, to: user.email, subject, text });
      delivered = true;
    } catch (error) {
      console.error("Resend invite email failed", error);
    }
  }

  return NextResponse.json({
    message: delivered
      ? `A new invite has been emailed to ${user.email}.`
      : `New invite link generated for ${user.name}. Share this link directly with them.`,
    inviteUrl: delivered ? undefined : url,
  });
}
