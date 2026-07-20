import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { toMinorUnits, validateProject } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { context, response } = await guardRoute("project.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const { data, errors } = validateProject(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const client = await db.client.findUnique({ where: { id: data.clientId } });
  if (!client) return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { clientId: "That client no longer exists." } }, { status: 422 });

  // Codes are namespaced by client so two clients can each have a "WEB-01".
  const code = `${client.code}-${data.code}`;
  if (await db.project.findUnique({ where: { code } })) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { code: `${client.code} already has a project with that code.` } }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: data.name, code, clientId: client.id,
        status: data.status as never, billing: data.billing as never,
        budgetAmount: toMinorUnits(data.budgetAmount), budgetCurrency: data.budgetCurrency || "INR",
        defaultRate: toMinorUnits(data.defaultRate),
        startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
        endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
        managerId: data.managerId || null,
        notes: data.notes || null,
      },
    });
    // Every project gets a default task so time can be booked immediately.
    await tx.projectTask.create({ data: { projectId: project.id, name: "General", billable: data.billing !== "NON_BILLABLE", sortOrder: 0 } });
    // The manager is assigned automatically; without an assignment nobody can book time.
    if (data.managerId) await tx.projectAssignment.create({ data: { projectId: project.id, userId: data.managerId } });
    await recordAudit({ actorId: context.user.id, action: "project.create", entityType: "Project", entityId: project.id, after: { code, name: project.name, client: client.name }, ipAddress: clientIp(request) }, tx);
    return project;
  });

  return NextResponse.json({ message: `${created.name} created as ${created.code}.`, id: created.id });
}
