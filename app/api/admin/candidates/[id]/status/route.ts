import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Activate or archive a candidate. Requires candidate.manage.
 *
 * Archiving is the reversible alternative to Delete: the record keeps its real
 * name, visa details and pipeline history, and simply drops out of the active
 * pool until someone restores it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("candidate.manage");
  if (response) return response;

  const { id } = await params;
  const candidate = await db.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  // A real boolean is required: treating a missing field as "archive" would let
  // an empty POST silently take a candidate out of the pool.
  if (typeof input.active !== "boolean") {
    return NextResponse.json(
      { message: "Please submit a valid request.", errors: { active: "Expected true or false." } },
      { status: 422 }
    );
  }

  const status = input.active ? "ACTIVE" : "ARCHIVED";
  if (candidate.status === status) {
    return NextResponse.json(
      { message: `${candidate.name} is already ${input.active ? "active" : "archived"}.` },
      { status: 409 }
    );
  }

  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id },
      data: { status, archivedAt: input.active ? null : new Date() },
    });
    await recordAudit(
      {
        actorId: context.user.id,
        action: input.active ? "candidate.activate" : "candidate.archive",
        entityType: "Candidate",
        entityId: id,
        before: { status: candidate.status },
        after: { status },
        ipAddress: clientIp(request),
      },
      tx
    );
  });

  return NextResponse.json({
    message: input.active
      ? `${candidate.name} is active again.`
      : `${candidate.name} has been archived. Their record and history are kept.`,
  });
}
