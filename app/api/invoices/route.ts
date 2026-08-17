import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { formatMoney, hoursToCentihours, invoiceTotals, lineAmount, toMinor } from "@/lib/money";
import { notifyLeadership } from "@/lib/notify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AVX-INV-${year}-`;
  const latest = await db.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const sequence = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

/**
 * Raises a draft invoice.
 *
 * With `fromTimesheets`, lines are built from APPROVED billable time on the
 * project that has not been invoiced before — approved only, because a draft
 * timesheet is not yet a claim anyone has stood behind.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("invoice.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const clientId = String(input.clientId ?? "");
  const projectId = String(input.projectId ?? "") || null;
  const issueDate = String(input.issueDate ?? "").trim();
  const dueDate = String(input.dueDate ?? "").trim();
  const taxPercent = Number(input.taxPercent ?? 0);
  const fromTimesheets = input.fromTimesheets === true;

  const errors: Record<string, string> = {};
  if (!clientId) errors.clientId = "Please choose a client.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) errors.issueDate = "Please enter the issue date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) errors.dueDate = "Please enter the due date.";
  if (issueDate && dueDate && dueDate < issueDate) errors.dueDate = "The due date cannot be before the issue date.";
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) errors.taxPercent = "Tax must be between 0 and 100.";

  const client = clientId ? await db.client.findUnique({ where: { id: clientId } }) : null;
  if (clientId && !client) errors.clientId = "That client no longer exists.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  type Line = { description: string; quantity: number; unitRate: number; amount: number; sortOrder: number };
  const lines: Line[] = [];

  if (fromTimesheets) {
    if (!projectId) return NextResponse.json({ message: "Choose a project to invoice its time." }, { status: 422 });
    const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
    if (!project || project.clientId !== clientId) return NextResponse.json({ message: "That project does not belong to this client." }, { status: 422 });

    const entries = await db.timeEntry.findMany({
      where: { projectId, billable: true, timesheet: { status: "APPROVED" }, invoicedAt: null },
      include: { timesheet: { include: { user: { select: { name: true } } } }, task: true },
    });

    if (entries.length === 0) {
      return NextResponse.json({ message: "There is no approved, un-invoiced billable time on that project." }, { status: 409 });
    }

    // One line per person, at their assigned rate or the project default.
    const assignments = await db.projectAssignment.findMany({ where: { projectId } });
    const byPerson = new Map<string, { name: string; minutes: number }>();
    for (const entry of entries) {
      const key = entry.timesheet.userId;
      const bucket = byPerson.get(key) ?? { name: entry.timesheet.user.name, minutes: 0 };
      bucket.minutes += entry.minutes;
      byPerson.set(key, bucket);
    }

    let order = 0;
    for (const [userId, bucket] of byPerson) {
      const rate = assignments.find((a) => a.userId === userId)?.rate ?? project.defaultRate ?? 0;
      const quantity = hoursToCentihours(bucket.minutes);
      lines.push({
        description: `${project.name} — ${bucket.name} (professional services)`,
        quantity, unitRate: rate, amount: lineAmount(quantity, rate), sortOrder: order++,
      });
    }
  } else {
    const raw = Array.isArray(input.lines) ? input.lines as Record<string, unknown>[] : [];
    if (raw.length === 0) return NextResponse.json({ message: "Add at least one line." }, { status: 422 });
    let order = 0;
    for (const row of raw) {
      const description = String(row.description ?? "").trim();
      const quantity = Math.round(Number(row.quantity ?? 0) * 100);
      const unitRate = toMinor(String(row.unitRate ?? ""));
      if (!description) return NextResponse.json({ message: "Every line needs a description." }, { status: 422 });
      if (!Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ message: "Every line needs a quantity." }, { status: 422 });
      if (unitRate === null || Number.isNaN(unitRate)) return NextResponse.json({ message: "Every line needs a rate." }, { status: 422 });
      lines.push({ description, quantity, unitRate, amount: lineAmount(quantity, unitRate), sortOrder: order++ });
    }
  }

  const { subtotal, taxAmount, total } = invoiceTotals(lines, taxPercent);

  const created = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        number: await nextNumber(), clientId, projectId,
        issueDate: new Date(`${issueDate}T00:00:00.000Z`),
        dueDate: new Date(`${dueDate}T00:00:00.000Z`),
        currency: String(input.currency ?? "INR"),
        taxPercent, subtotal, taxAmount, total,
        notes: String(input.notes ?? "").trim() || null,
        lines: { create: lines },
      },
    });
    // Stamp the entries so the same hours cannot be billed twice.
    if (fromTimesheets && projectId) {
      await tx.timeEntry.updateMany({
        where: { projectId, billable: true, timesheet: { status: "APPROVED" }, invoicedAt: null },
        data: { invoicedAt: new Date(), invoiceId: invoice.id },
      });
    }
    await notifyLeadership({
      kind: "INVOICE",
      title: `Invoice Raised: ${invoice.number}`,
      body: `${context.user.name} raised invoice ${invoice.number} for ${formatMoney(total, invoice.currency)}.`,
      link: `/invoices`,
    }, tx);
    await recordAudit({ actorId: context.user.id, action: "invoice.create", entityType: "Invoice", entityId: invoice.id, after: { number: invoice.number, total }, ipAddress: clientIp(request) }, tx);
    return invoice;
  });

  return NextResponse.json({ message: `${created.number} raised.`, id: created.id });
}
