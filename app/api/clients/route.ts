import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { validateClient } from "@/lib/delivery/validate";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { context, response } = await guardRoute("client.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const { data, errors } = validateClient(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  // Name and code are both unique; report the clash rather than 500ing.
  const clash = await db.client.findFirst({ where: { OR: [{ name: data.name }, { code: data.code }] } });
  if (clash) {
    return NextResponse.json({
      message: "Please correct the highlighted fields.",
      errors: clash.code === data.code ? { code: "Another client already uses that code." } : { name: "A client with that name already exists." },
    }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: data.name, code: data.code, status: data.status as never,
        industry: data.industry || null, website: data.website || null,
        notes: data.notes || null, ownerId: data.ownerId || null,
      },
    });
    await recordAudit({ actorId: context.user.id, action: "client.create", entityType: "Client", entityId: client.id, after: { name: client.name, code: client.code }, ipAddress: clientIp(request) }, tx);
    return client;
  });

  return NextResponse.json({ message: `${created.name} added.`, id: created.id });
}
