import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/app-origin";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { canTransition, canViewLetter } from "@/lib/contracts/workflow";
import { notify } from "@/lib/notify";
import { db } from "@/lib/db";
import type { ContractStatus } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

const STATUSES: ReadonlyArray<ContractStatus> = [
  "DRAFT",
  "PENDING_RELEASE",
  "CHANGES_REQUESTED",
  "RELEASED",
  "ACKNOWLEDGED",
  "REVOKED",
];

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const { id } = await params;
  const letter = await db.contractLetter.findUnique({ where: { id }, include: { subject: true } });
  if (!letter || !canViewLetter(context, letter)) {
    return NextResponse.json({ message: "That contract letter could not be found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const to = String(input.to ?? "") as ContractStatus;
  const note = String(input.note ?? "").trim().slice(0, 1000);

  if (!STATUSES.includes(to)) return NextResponse.json({ message: "That is not a valid status." }, { status: 400 });

  const check = canTransition(context, letter, to);
  if (!check.ok) return NextResponse.json({ message: check.reason }, { status: check.status });

  await db.$transaction(async (tx) => {
    await tx.contractLetter.update({
      where: { id: letter.id },
      data: {
        status: to,
        ...(to === "RELEASED" ? { releasedAt: new Date(), releasedById: context.user.id } : {}),
        ...(to === "REVOKED" ? { revokedAt: new Date(), revokedById: context.user.id } : {}),
      },
    });
    await tx.contractLetterEvent.create({
      data: {
        letterId: letter.id,
        fromStatus: letter.status,
        toStatus: to,
        actorId: context.user.id,
        note: note || null,
      },
    });
    // The subject only needs to hear about the outcomes that affect them.
    if (to === "RELEASED" || to === "REVOKED") {
      await notify(
        {
          userId: letter.subjectUserId,
          kind: "CONTRACT",
          title:
            to === "RELEASED"
              ? "A contract letter has been issued to you"
              : "A contract letter was withdrawn",
          body: letter.reference,
          link: `/contracts/${letter.id}`,
        },
        tx
      );
    }
    await recordAudit(
      {
        actorId: context.user.id,
        action: `contract.${to.toLowerCase()}`,
        entityType: "ContractLetter",
        entityId: letter.id,
        before: { status: letter.status },
        after: { status: to, reference: letter.reference },
        ipAddress: clientIp(request),
      },
      tx
    );
  });

  // Dispatch email notification upon release
  if (to === "RELEASED" && letter.subject?.email) {
    const config = smtp();
    if (config) {
      try {
        const subject = `Your contract letter ${letter.reference} has been released`;
        const contractUrl = `${appOrigin()}/contracts/${letter.id}`;
        const text = [
          `Dear ${letter.subject.name},`,
          "",
          `Your contract letter (${letter.reference}) has been officially released and is ready for your review and acknowledgement in the staff portal:`,
          contractUrl,
          "",
          "Please review the document terms and confirm your acceptance.",
          "",
          "Regards,",
          "QONIC Leadership Team",
        ].join("\n");

        const transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.auth,
        });
        await transporter.sendMail({ from: config.from, to: letter.subject.email, subject, text });
      } catch (err) {
        console.error("Contract release email delivery error:", err);
      }
    }
  }

  return NextResponse.json({
    message: `${letter.reference} — ${check.rule.label.toLowerCase()} complete.`,
  });
}
