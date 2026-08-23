import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { formatMoney, hoursToCentihours, invoiceTotals, lineAmount, toMinor } from "@/lib/money";
import { notifyLeadership, sendEmail } from "@/lib/notify";
import { c2cCommissionBreakdown } from "@/lib/finance/c2c";
import { db } from "@/lib/db";
import { nextReferenceFrom, referenceWhere } from "@/lib/reference";

export const runtime = "nodejs";

/** Sequential per year, e.g. QNC-INV-2026-0001 (prefix from lib/reference). */
async function nextNumbers(count: number): Promise<string[]> {
  const year = new Date().getFullYear();
  // Legacy-prefixed records are matched too, so the rename from AVX to
  // QNC continues the year's sequence instead of restarting it at 0001.
  const existing = await db.invoice.findMany({
    where: { OR: referenceWhere("number", "INV", year) },
    select: { number: true },
  });
  const seen = existing.map((row) => row.number);
  const numbers: string[] = [];
  for (let index = 0; index < count; index++) {
    const next = nextReferenceFrom([...seen, ...numbers], "INV", year);
    numbers.push(next);
  }
  return numbers;
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

  const client = clientId ? await db.client.findUnique({
    where: { id: clientId },
    include: { vendor: true, globalCandidate: true },
  }) : null;
  if (clientId && !client) errors.clientId = "That client no longer exists.";
  const isC2C = client?.employmentType === "C2C";
  if (isC2C && taxPercent !== 0) errors.taxPercent = "C2C invoices use the commission reconciliation amount and cannot add tax.";
  if (isC2C && (!client?.actualClientRate || !client.globalCandidate || !client.vendor || client.globalCandidateCommissionPercent === null || client.vendorCommissionPercent === null)) {
    errors.clientId = "This C2C client needs an actual rate, vendor, Global Candidate, and both commission percentages before invoicing.";
  }
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  type Line = { description: string; quantity: number; unitRate: number; amount: number; sortOrder: number };
  const lines: Line[] = [];
  // Only entries that actually contributed to invoice lines may be stamped
  // invoiced. Project Start Date, not Developer Actual Start, gates billing.
  let timeEntryIdsToInvoice: string[] = [];

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
      if (project.startDate && entry.workDate < project.startDate) continue;
      timeEntryIdsToInvoice.push(entry.id);
      const key = entry.timesheet.userId;
      const bucket = byPerson.get(key) ?? { name: entry.timesheet.user.name, minutes: 0 };
      bucket.minutes += entry.minutes;
      byPerson.set(key, bucket);
    }

    let order = 0;
    for (const [userId, bucket] of byPerson) {
      const rate = isC2C
        ? client!.actualClientRate!
        : assignments.find((a) => a.userId === userId)?.rate ?? project.defaultRate ?? 0;
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
  if (lines.length === 0) {
    return NextResponse.json({ message: "There is no approved billable time on or after the Project Start Date." }, { status: 409 });
  }
  let c2c: ReturnType<typeof c2cCommissionBreakdown> | null = null;
  try {
    if (isC2C) {
      c2c = c2cCommissionBreakdown({
        grossClientAmount: subtotal,
        globalCandidateCommissionPercent: client!.globalCandidateCommissionPercent!,
        vendorCommissionPercent: client!.vendorCommissionPercent!,
      });
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to calculate C2C commission." }, { status: 422 });
  }
  const numbers = await nextNumbers(c2c ? 3 : 1);

  const created = await db.$transaction(async (tx) => {
    const base = {
      clientId, projectId,
      issueDate: new Date(`${issueDate}T00:00:00.000Z`),
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      currency: client?.rateCurrency || String(input.currency ?? "INR"),
      notes: String(input.notes ?? "").trim() || null,
    };
    const commercialGroupId = c2c ? randomUUID() : null;
    const reconciliation = c2c ? {
      commercialGroupId,
      grossClientAmount: c2c.grossClientAmount,
      vendorCommissionAmount: c2c.vendorCommissionAmount,
      globalCandidateCommissionAmount: c2c.globalCandidateCommissionAmount,
      qonicRevenueAmount: c2c.qonicRevenueAmount,
    } : {};

    const invoice = c2c
      ? await tx.invoice.create({
          data: {
            ...base, ...reconciliation,
            number: numbers[0], commercialKind: "QONIC_TO_VENDOR",
            billingRecipient: client!.vendor!.name,
            taxPercent: 0, taxAmount: 0,
            subtotal: c2c.qonicRevenueAmount, total: c2c.qonicRevenueAmount,
            lines: { create: [{ description: `Qonic revenue — ${client!.name} C2C billing after agreed commissions`, quantity: 100, unitRate: c2c.qonicRevenueAmount, amount: c2c.qonicRevenueAmount, sortOrder: 0 }] },
          },
        })
      : await tx.invoice.create({
          data: {
            ...base,
            number: numbers[0],
            taxPercent, subtotal, taxAmount, total,
            lines: { create: lines },
          },
        });

    if (c2c) {
      await tx.invoice.create({
        data: {
          ...base, ...reconciliation,
          number: numbers[1], commercialKind: "VENDOR_TO_GLOBAL_CANDIDATE",
          billingRecipient: client!.globalCandidate!.name,
          taxPercent: 0, taxAmount: 0,
          subtotal: c2c.globalCandidateCommissionAmount, total: c2c.globalCandidateCommissionAmount,
          notes: `Vendor payment instruction. ${base.notes ?? ""}`.trim(),
          lines: { create: [{ description: `Vendor payment to ${client!.globalCandidate!.name} — Global Candidate commission`, quantity: 100, unitRate: c2c.globalCandidateCommissionAmount, amount: c2c.globalCandidateCommissionAmount, sortOrder: 0 }] },
        },
      });
      await tx.invoice.create({
        data: {
          ...base, ...reconciliation,
          number: numbers[2], commercialKind: "GLOBAL_CANDIDATE_COMMISSION_RECORD",
          billingRecipient: client!.globalCandidate!.name,
          taxPercent: 0, taxAmount: 0,
          subtotal: c2c.globalCandidateCommissionAmount, total: c2c.globalCandidateCommissionAmount,
          notes: `Documentation record: this commission is held by ${client!.vendor!.name} and payable to the Global Candidate. ${base.notes ?? ""}`.trim(),
          lines: { create: [{ description: `Global Candidate commission held by ${client!.vendor!.name}`, quantity: 100, unitRate: c2c.globalCandidateCommissionAmount, amount: c2c.globalCandidateCommissionAmount, sortOrder: 0 }] },
        },
      });
    }
    // Stamp the entries so the same hours cannot be billed twice.
    if (fromTimesheets && timeEntryIdsToInvoice.length > 0) {
      await tx.timeEntry.updateMany({
        where: { id: { in: timeEntryIdsToInvoice }, invoicedAt: null },
        data: { invoicedAt: new Date(), invoiceId: invoice.id },
      });
    }
    await notifyLeadership({
      kind: "INVOICE",
      title: c2c ? `C2C invoice set raised: ${invoice.number}` : `Invoice Raised: ${invoice.number}`,
      body: c2c
        ? `${context.user.name} raised the reconciled C2C invoice set for ${formatMoney(c2c.grossClientAmount, invoice.currency)} gross; Qonic revenue is ${formatMoney(c2c.qonicRevenueAmount, invoice.currency)}.`
        : `${context.user.name} raised invoice ${invoice.number} for ${formatMoney(total, invoice.currency)}.`,
      link: `/invoices`,
    }, tx);
    await recordAudit({ actorId: context.user.id, action: "invoice.create", entityType: "Invoice", entityId: invoice.id, after: { number: invoice.number, total: c2c?.qonicRevenueAmount ?? total, commercialGroupId, reconciliation: c2c }, ipAddress: clientIp(request) }, tx);
    return invoice;
  });

  if (c2c) {
    if (client!.vendor?.email) {
      void sendEmail(
        [client!.vendor.email],
        `C2C payment instruction — ${created.number}`,
        `A C2C invoice set has been created for ${client!.name}. The Qonic amount due is ${formatMoney(c2c.qonicRevenueAmount, client!.rateCurrency)} and the Global Candidate commission payment instruction is included in the matching records.`,
        "/invoices"
      );
    }
    if (client!.globalCandidate?.email) {
      void sendEmail(
        [client!.globalCandidate.email],
        `Global Candidate commission record created — ${client!.name}`,
        `A commission record has been created for ${client!.name}. Your agreed commission is ${formatMoney(c2c.globalCandidateCommissionAmount, client!.rateCurrency)} and is held by the vendor for payment.`,
        "/invoices"
      );
    }
  }

  return NextResponse.json({ message: c2c ? `${created.number} and two matching C2C commission records raised.` : `${created.number} raised.`, id: created.id });
}
