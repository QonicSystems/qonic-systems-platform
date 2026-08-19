import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { validateContractPayload } from "@/lib/contracts/payload";
import { DEFAULT_TEMPLATE_KEY, LETTER_TEMPLATES } from "@/lib/contracts/templates";
import { db } from "@/lib/db";
import { nextReferenceFrom, referenceWhere } from "@/lib/reference";

export const runtime = "nodejs";

/** Sequential per year, e.g. QNC-CL-2026-0001 (prefix from lib/reference). */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  // Legacy-prefixed records are matched too, so the rename from AVX to
  // QNC continues the year's sequence instead of restarting it at 0001.
  const existing = await db.contractLetter.findMany({
    where: { OR: referenceWhere("reference", "CL", year) },
    select: { reference: true },
  });
  return nextReferenceFrom(existing.map((row) => row.reference), "CL", year);
}

/** HR drafts a contract letter for an employee. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("contract.generate");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const subjectUserId = String(input.subjectUserId ?? "").trim();
  const requestedTemplate = String(input.templateKey ?? DEFAULT_TEMPLATE_KEY).trim();

  const { data, errors } = validateContractPayload(input);
  if (!subjectUserId) errors.subjectUserId = "Please choose an employee.";
  if (!LETTER_TEMPLATES.some((template) => template.key === requestedTemplate)) errors.templateKey = "Please choose a letter type.";

  const subject = subjectUserId ? await db.user.findUnique({ where: { id: subjectUserId }, include: { role: true } }) : null;
  if (subjectUserId && !subject) errors.subjectUserId = "That employee no longer exists.";

  // Drafting a letter for yourself would let the author also be the beneficiary.
  if (subject && subject.id === context.user.id) errors.subjectUserId = "You cannot create a contract letter for yourself.";

  // Same seniority rule as editing a profile: HR can draft for Employees only.
  if (subject && subject.id !== context.user.id) {
    const authority = canAdminister(context, subject);
    if (!authority.ok) errors.subjectUserId = authority.reason;
  }

  if (!data || Object.keys(errors).length) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  const letter = await db.$transaction(async (tx) => {
    const created = await tx.contractLetter.create({
      data: { reference: await nextReference(), subjectUserId: subject!.id, authorUserId: context.user.id, templateKey: requestedTemplate, payload: { ...data }, status: "DRAFT" },
    });
    await tx.contractLetterEvent.create({ data: { letterId: created.id, fromStatus: null, toStatus: "DRAFT", actorId: context.user.id, note: "Draft created." } });
    await recordAudit({ actorId: context.user.id, action: "contract.create", entityType: "ContractLetter", entityId: created.id, after: { reference: created.reference, subject: subject!.email, template: requestedTemplate }, ipAddress: clientIp(request) }, tx);
    return created;
  });

  return NextResponse.json({ message: `Draft ${letter.reference} created.`, id: letter.id });
}
