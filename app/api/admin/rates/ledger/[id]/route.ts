import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const CATEGORIES = ["ACTUAL_PAYOUT", "BILLED_TO_COMPANY"] as const;

/**
 * Reclassifies a payout ledger entry, admin-only. The computed `category` is
 * never touched — this only ever sets/clears the `override*` fields, so the
 * original computed value stays recoverable (see the model comment in
 * prisma/schema.prisma).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("payout.manage");
  if (response) return response;

  const { id } = await params;
  const entry = await db.payoutLedgerEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ message: "That payout entry could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  // `category: null` clears the override, back to the originally computed value.
  const category = input.category === null ? null : String(input.category ?? "");
  if (category !== null && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ message: "That is not a valid category." }, { status: 422 });
  }
  const note = String(input.note ?? "").trim().slice(0, 500) || null;

  await db.$transaction(async (tx) => {
    await tx.payoutLedgerEntry.update({
      where: { id },
      data: category === null
        ? { overrideCategory: null, overriddenById: null, overriddenAt: null, overrideNote: null }
        : { overrideCategory: category as (typeof CATEGORIES)[number], overriddenById: context.user.id, overriddenAt: new Date(), overrideNote: note },
    });
    await recordAudit({
      actorId: context.user.id,
      action: "payout.ledger.reclassify",
      entityType: "PayoutLedgerEntry",
      entityId: id,
      before: { overrideCategory: entry.overrideCategory, category: entry.category },
      after: { overrideCategory: category, note },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: category === null ? "Reclassification cleared." : "Payout entry reclassified." });
}
