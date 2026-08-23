import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { parseCompensationInput } from "@/lib/finance/compensation";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";

function mayManageCompensation(context: { role: { key: string; isSuperAdmin: boolean } }) {
  // This is deliberately stronger than a broadly grantable permission. Salary
  // is the one People field the founders explicitly retain, even if an HR or
  // Operations role is allowed to maintain ordinary account details.
  return context.role.isSuperAdmin || context.role.key === ROLE.CO_FOUNDER;
}

/** Adds a new effective-dated salary decision for a non-Developer People account. */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { context, response } = await guardRoute("compensation.manage");
  if (response) return response;
  if (!mayManageCompensation(context)) {
    return NextResponse.json({ message: "Only the CEO or Co-Founder may set compensation." }, { status: 403 });
  }

  const { userId } = await params;
  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) return NextResponse.json({ message: "That person could not be found." }, { status: 404 });
  if (target.role.viaCandidatePool) {
    return NextResponse.json({ message: "Developer pay comes from their accepted employment contract and approved delivery ledger, not a People salary profile." }, { status: 409 });
  }
  if (target.status !== "ACTIVE") return NextResponse.json({ message: "Compensation can only be set for an active account." }, { status: 409 });
  if (target.id !== context.user.id) {
    const authority = canAdminister(context, target);
    if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid compensation decision." }, { status: 400 });
  }
  const { data, errors } = parseCompensationInput(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const latest = await db.compensationProfile.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
  });
  if (latest && data.effectiveFrom <= latest.effectiveFrom) {
    return NextResponse.json({
      message: "Compensation history is immutable. Choose an effective date after the latest recorded decision.",
      errors: { effectiveFrom: "Choose a later effective date." },
    }, { status: 409 });
  }

  const profile = await db.$transaction(async (tx) => {
    // A replacement closes only the currently open schedule. It never edits a
    // past amount, which keeps raised earnings invoices traceable.
    if (latest && !latest.effectiveTo) {
      await tx.compensationProfile.update({
        where: { id: latest.id },
        data: { effectiveTo: new Date(data.effectiveFrom.getTime() - 86_400_000) },
      });
    }
    const created = await tx.compensationProfile.create({
      data: { userId, ...data, setById: context.user.id },
    });
    await recordAudit({
      actorId: context.user.id,
      action: "compensation.set",
      entityType: "CompensationProfile",
      entityId: created.id,
      after: { userId, monthlyAmount: created.monthlyAmount, currency: created.currency, effectiveFrom: created.effectiveFrom.toISOString().slice(0, 10) },
      ipAddress: clientIp(request),
    }, tx);
    return created;
  });

  return NextResponse.json({
    message: `Monthly compensation for ${target.name} is set to ${formatMoney(profile.monthlyAmount, profile.currency)} from ${profile.effectiveFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`,
    profile: { id: profile.id, monthlyAmount: profile.monthlyAmount, currency: profile.currency, effectiveFrom: profile.effectiveFrom.toISOString().slice(0, 10) },
  }, { status: 201 });
}
