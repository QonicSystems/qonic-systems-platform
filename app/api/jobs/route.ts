import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinor } from "@/lib/money";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const STATUSES = ["DRAFT", "OPEN", "ON_HOLD", "FILLED", "CLOSED"];

async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AVX-JOB-${year}-`;
  const latest = await db.job.findFirst({ where: { reference: { startsWith: prefix } }, orderBy: { reference: "desc" } });
  const sequence = latest ? Number(latest.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export async function POST(request: Request) {
  const { context, response } = await guardRoute("job.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const title = String(input.title ?? "").trim();
  const clientId = String(input.clientId ?? "").trim();
  const status = String(input.status ?? "DRAFT");
  const openings = Number(input.openings ?? 1);
  const salaryMin = toMinor(String(input.salaryMin ?? ""));
  const salaryMax = toMinor(String(input.salaryMax ?? ""));
  const feePercent = String(input.feePercent ?? "").trim();
  const slaDays = String(input.slaDays ?? "").trim();

  const errors: Record<string, string> = {};
  if (title.length < 2) errors.title = "Please enter the job title.";
  if (!clientId) errors.clientId = "Please choose a client.";
  if (!STATUSES.includes(status)) errors.status = "Please choose a status.";
  if (!Number.isInteger(openings) || openings < 1) errors.openings = "Enter how many people are needed.";
  if (Number.isNaN(salaryMin)) errors.salaryMin = "Enter the minimum as a number.";
  if (Number.isNaN(salaryMax)) errors.salaryMax = "Enter the maximum as a number.";
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) errors.salaryMax = "The maximum cannot be below the minimum.";
  if (feePercent && !/^\d{1,2}(\.\d{1,2})?$/.test(feePercent)) errors.feePercent = "Enter the fee as a percentage, e.g. 12.5.";
  if (slaDays && !/^\d{1,3}$/.test(slaDays)) errors.slaDays = "Enter the SLA in whole days.";

  const client = clientId ? await db.client.findUnique({ where: { id: clientId } }) : null;
  if (clientId && !client) errors.clientId = "That client no longer exists.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const created = await db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        reference: await nextReference(), title, clientId: client!.id, status: status as never,
        description: String(input.description ?? "").trim() || null,
        location: String(input.location ?? "").trim() || null,
        employmentType: String(input.employmentType ?? "Full-time"),
        openings, salaryMin, salaryMax, currency: String(input.currency ?? "INR"),
        feePercent: feePercent ? Number(feePercent) : null,
        slaDays: slaDays ? Number(slaDays) : null,
        // Only an OPEN job can be advertised — publishing a draft would expose
        // a requisition the client has not signed off.
        isPublished: input.isPublished === true && status === "OPEN",
        ownerId: context.user.id,
      },
    });
    await recordAudit({ actorId: context.user.id, action: "job.create", entityType: "Job", entityId: job.id, after: { reference: job.reference, title, client: client!.name }, ipAddress: clientIp(request) }, tx);
    return job;
  });

  return NextResponse.json({ message: `${created.reference} — ${created.title} created.`, id: created.id });
}

export async function PATCH(request: Request) {
  const { context, response } = await guardRoute("job.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const id = String(input.id ?? "");
  const status = String(input.status ?? "");
  const publish = input.isPublished;

  const job = await db.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ message: "That job could not be found." }, { status: 404 });
  if (status && !STATUSES.includes(status)) return NextResponse.json({ message: "That is not a valid status." }, { status: 400 });

  const nextStatus = status || job.status;
  const nextPublished = typeof publish === "boolean" ? publish : job.isPublished;
  if (nextPublished && nextStatus !== "OPEN") {
    return NextResponse.json({ message: "Only an open job can be published to the careers page." }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id }, data: { status: nextStatus as never, isPublished: nextPublished } });
    await recordAudit({ actorId: context.user.id, action: "job.update", entityType: "Job", entityId: id, before: { status: job.status, published: job.isPublished }, after: { status: nextStatus, published: nextPublished }, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: `${job.reference} updated.` });
}
