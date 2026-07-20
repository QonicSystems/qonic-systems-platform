import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type ProfileErrors = Partial<Record<"name" | "phone" | "jobTitle", string>>;

/** Users may edit their own display details — never their own role or status. */
export async function PATCH(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }

  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const data = {
    name: String(input.name ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    jobTitle: String(input.jobTitle ?? "").trim(),
  };
  const errors: ProfileErrors = {};
  if (data.name.length < 2) errors.name = "Please enter a name with at least 2 characters.";
  if (data.phone && !/^[+\d][\d\s()-]{5,}$/.test(data.phone)) errors.phone = "Please enter a valid phone number.";
  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const before = await db.user.findUniqueOrThrow({ where: { id: context.user.id }, select: { name: true, phone: true, jobTitle: true } });
  const after = { name: data.name, phone: data.phone || null, jobTitle: data.jobTitle || null };

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: context.user.id }, data: after });
    await recordAudit({ actorId: context.user.id, action: "profile.update", entityType: "User", entityId: context.user.id, before, after, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: "Profile updated." });
}
