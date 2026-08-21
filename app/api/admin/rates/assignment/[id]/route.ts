import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Sets (or clears) a project assignment's hourly rate override, and/or the
 * date this person actually started on the project — both admin-only, both
 * optional per request so the rate input and the started-on input can each
 * save independently on their own blur.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("payout.manage");
  if (response) return response;

  const { id } = await params;
  const assignment = await db.projectAssignment.findUnique({ where: { id } });
  if (!assignment) return NextResponse.json({ message: "That assignment could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const data: { rate?: number | null; startedOn?: Date | null } = {};

  if (input.rate !== undefined) {
    const rate = toMinor(String(input.rate ?? ""));
    if (rate !== null && Number.isNaN(rate)) {
      return NextResponse.json({ message: "Enter the hourly rate as a number, e.g. 500, or leave blank to clear it." }, { status: 422 });
    }
    data.rate = rate;
  }

  if (input.startedOn !== undefined) {
    const raw = String(input.startedOn ?? "").trim();
    if (!raw) {
      data.startedOn = null;
    } else {
      const parsed = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ message: "Enter a valid start date, or leave blank to clear it." }, { status: 422 });
      }
      data.startedOn = parsed;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.projectAssignment.update({ where: { id }, data });
    await recordAudit({
      actorId: context.user.id,
      action: "payout.rate.update",
      entityType: "ProjectAssignment",
      entityId: id,
      before: { rate: assignment.rate, startedOn: assignment.startedOn },
      after: { rate: data.rate ?? assignment.rate, startedOn: data.startedOn !== undefined ? data.startedOn : assignment.startedOn },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Assignment updated." });
}
