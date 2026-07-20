import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const DECISIONS = ["APPROVED", "REJECTED", "REIMBURSED"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("expense.approve");
  if (response) return response;

  const { id } = await params;
  const expense = await db.expense.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!expense) return NextResponse.json({ message: "That expense could not be found." }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const decision = String(input.decision ?? "");
  const note = String(input.note ?? "").trim().slice(0, 1000);

  if (!DECISIONS.includes(decision)) return NextResponse.json({ message: "That is not a valid decision." }, { status: 400 });

  // Approving your own claim is the classic expenses fraud, so it is blocked
  // outright — the same segregation-of-duties rule used elsewhere.
  if (expense.userId === context.user.id) {
    return NextResponse.json({ message: "You cannot decide your own expense claim." }, { status: 403 });
  }

  if (decision === "REIMBURSED" && expense.status !== "APPROVED") {
    return NextResponse.json({ message: "Only an approved expense can be marked reimbursed." }, { status: 409 });
  }
  if (decision !== "REIMBURSED" && expense.status !== "SUBMITTED") {
    return NextResponse.json({ message: "Only a submitted expense can be approved or rejected." }, { status: 409 });
  }
  if (decision === "REJECTED" && note.length < 3) {
    return NextResponse.json({ message: "Please explain why it was rejected." }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: {
        status: decision as never,
        decidedById: context.user.id, decidedAt: new Date(), decisionNote: note || null,
        reimbursedAt: decision === "REIMBURSED" ? new Date() : null,
      },
    });
    await recordAudit({ actorId: context.user.id, action: `expense.${decision.toLowerCase()}`, entityType: "Expense", entityId: id, before: { status: expense.status }, after: { status: decision, claimant: expense.user.name }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `${expense.user.name}'s claim was ${decision.toLowerCase()}.` });
}
