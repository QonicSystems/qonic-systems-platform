import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export const CATEGORIES = ["Travel", "Accommodation", "Meals", "Software", "Equipment", "Training", "Other"];

export async function POST(request: Request) {
  const { context, response } = await guardRoute("expense.submit");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const amount = toMinor(String(input.amount ?? ""));
  const spentOn = String(input.spentOn ?? "").trim();
  const description = String(input.description ?? "").trim();
  const category = String(input.category ?? "Other");
  const receiptUrl = String(input.receiptUrl ?? "").trim();

  const errors: Record<string, string> = {};
  if (amount === null || Number.isNaN(amount) || amount <= 0) errors.amount = "Enter the amount as a number.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) errors.spentOn = "Please enter the date.";
  else if (new Date(`${spentOn}T00:00:00.000Z`) > new Date()) errors.spentOn = "The date cannot be in the future.";
  if (description.length < 3) errors.description = "Please describe what this was for.";
  if (!CATEGORIES.includes(category)) errors.category = "Please choose a category.";
  if (receiptUrl) {
    // Receipts are LINKS — nothing is uploaded or stored here.
    try { if (new URL(receiptUrl).protocol !== "https:") errors.receiptUrl = "The receipt link must start with https://"; }
    catch { errors.receiptUrl = "Please enter a full receipt link, starting with https://"; }
  }
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const submit = input.submit === true;
  const created = await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        userId: context.user.id, amount: amount!, spentOn: new Date(`${spentOn}T00:00:00.000Z`),
        description, category, receiptUrl: receiptUrl || null,
        projectId: String(input.projectId ?? "").trim() || null,
        billable: input.billable === true,
        status: submit ? "SUBMITTED" : "DRAFT",
      },
    });
    await recordAudit({ actorId: context.user.id, action: submit ? "expense.submit" : "expense.draft", entityType: "Expense", entityId: expense.id, after: { amount, category }, ipAddress: clientIp(request) }, tx);
    return expense;
  });

  return NextResponse.json({ message: submit ? "Expense submitted for approval." : "Expense saved as a draft.", id: created.id });
}
