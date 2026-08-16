import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { validateContractPayload } from "@/lib/contracts/payload";
import { canDeleteLetter, canEditContent, canViewLetter } from "@/lib/contracts/workflow";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Edit a draft's terms. Only possible while DRAFT or CHANGES_REQUESTED. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("contract.generate");
  if (response) return response;

  const { id } = await params;
  const letter = await db.contractLetter.findUnique({ where: { id } });
  if (!letter || !canViewLetter(context, letter)) {
    return NextResponse.json({ message: "That contract letter could not be found." }, { status: 404 });
  }
  if (!canEditContent(context, letter)) {
    return NextResponse.json({ message: "This letter can no longer be edited." }, { status: 409 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const { data, errors } = validateContractPayload(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  await db.$transaction(async (tx) => {
    await tx.contractLetter.update({ where: { id: letter.id }, data: { payload: { ...data } } });
    await recordAudit({
      actorId: context.user.id, action: "contract.update", entityType: "ContractLetter", entityId: letter.id,
      before: letter.payload as never, after: { ...data }, ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({ message: "Draft saved." });
}

/** Permanently delete a contract letter if it is in REVOKED or DRAFT status. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("contract.generate");
  if (response) return response;

  const { id } = await params;
  const letter = await db.contractLetter.findUnique({ where: { id } });
  if (!letter) {
    return NextResponse.json({ message: "That contract letter could not be found." }, { status: 404 });
  }
  if (!canDeleteLetter(context, letter)) {
    return NextResponse.json({ message: "Only draft or revoked contract letters can be deleted." }, { status: 403 });
  }

  await db.$transaction(async (tx) => {
    await tx.contractLetterEvent.deleteMany({ where: { letterId: id } });
    await recordAudit({
      actorId: context.user.id,
      action: "contract.delete",
      entityType: "ContractLetter",
      entityId: id,
      before: { reference: letter.reference, status: letter.status },
      ipAddress: clientIp(request),
    }, tx);
    await tx.contractLetter.delete({ where: { id } });
  });

  return NextResponse.json({ message: `Contract letter ${letter.reference} deleted.` });
}
