import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await guardRoute("candidate.view");
  if (response) return response;

  const candidates = await db.candidate.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ candidates });
}

export async function POST(request: Request) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 });
  }

  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = String(input.name ?? "").trim().slice(0, 200);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);
  const phone = String(input.phone ?? "").trim().slice(0, 50);
  const ssn = String(input.ssn ?? "").trim().slice(0, 50);
  const visaType = String(input.visaType ?? "").trim().slice(0, 100);
  const visaStatus = String(input.visaStatus ?? "").trim().slice(0, 100);
  const visaExpiry = input.visaExpiry ? new Date(String(input.visaExpiry)) : null;
  const address = String(input.address ?? "").trim().slice(0, 500);
  const location = String(input.location ?? "").trim().slice(0, 200);
  const techStack = String(input.techStack ?? "").trim().slice(0, 500);
  const benchStatus = String(input.benchStatus ?? "Available / On Bench").trim().slice(0, 100);
  const commissionPaid = input.commissionPaid ? toMinor(String(input.commissionPaid)) : null;

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter a name with at least 2 characters.";
  if (!emailPattern.test(email)) errors.email = "Please enter a valid email address.";
  if (!techStack) errors.techStack = "Please specify tech stack / skills.";

  if (!errors.email) {
    const existing = await db.candidate.findUnique({ where: { email } });
    if (existing) errors.email = "A candidate already exists with that email address.";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const candidate = await tx.candidate.create({
      data: {
        name,
        email,
        phone: phone || null,
        ssn: ssn || null,
        visaType: visaType || null,
        visaStatus: visaStatus || null,
        visaExpiry: visaExpiry && !Number.isNaN(visaExpiry.getTime()) ? visaExpiry : null,
        address: address || null,
        location: location || null,
        techStack: techStack || null,
        skills: techStack || null,
        benchStatus,
        commissionPaid,
      },
    });

    await recordAudit(
      {
        actorId: context.user.id,
        action: "candidate.create",
        entityType: "Candidate",
        entityId: candidate.id,
        after: { name, email, visaType, techStack, benchStatus },
        ipAddress: clientIp(request),
      },
      tx
    );

    return candidate;
  });

  return NextResponse.json({
    message: `${created.name} added to Global Candidates.`,
    candidate: created,
  });
}
