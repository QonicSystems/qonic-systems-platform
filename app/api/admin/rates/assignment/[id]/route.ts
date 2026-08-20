import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Sets (or clears) a project assignment's hourly rate override, admin-only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("payout.manage");
  if (response) return response;

  const { id } = await params;
  const assignment = await db.projectAssignment.findUnique({ where: { id } });
  if (!assignment) return NextResponse.json({ message: "That assignment could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const rate = toMinor(String(input.rate ?? ""));
  if (rate !== null && Number.isNaN(rate)) {
    return NextResponse.json({ message: "Enter the hourly rate as a number, e.g. 500, or leave blank to clear it." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.projectAssignment.update({ where: { id }, data: { rate } });
    await recordAudit({
      actorId: context.user.id,
      action: "payout.rate.update",
      entityType: "ProjectAssignment",
      entityId: id,
      before: { rate: assignment.rate },
      after: { rate },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Hourly rate updated." });
}
