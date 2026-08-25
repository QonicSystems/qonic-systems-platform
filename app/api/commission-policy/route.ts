import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { validCommissionPercent } from "@/lib/finance/c2c";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const global = Number(input.defaultGlobalCandidateCommissionPercent);
  const vendor = Number(input.defaultVendorCommissionPercent);
  if (!validCommissionPercent(global) || !validCommissionPercent(vendor) || global + vendor > 100) {
    return NextResponse.json({ message: "Each commission must be 0–100%, and together they cannot exceed 100%." }, { status: 422 });
  }
  const policy = await db.$transaction(async (tx) => {
    const updated = await tx.commissionPolicy.upsert({ where: { id: "default" }, update: { defaultGlobalCandidateCommissionPercent: global, defaultVendorCommissionPercent: vendor }, create: { id: "default", defaultGlobalCandidateCommissionPercent: global, defaultVendorCommissionPercent: vendor } });
    await recordAudit({ actorId: context.user.id, action: "commission_policy.update", entityType: "CommissionPolicy", entityId: updated.id, after: { global, vendor }, ipAddress: clientIp(request) }, tx);
    return updated;
  });
  return NextResponse.json({ message: "Default C2C commissions updated. Existing jobs retain their agreed snapshot.", policy });
}
