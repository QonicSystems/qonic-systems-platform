import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Mark notifications read. Scoped to the caller so nobody can clear someone else's. */
export async function POST(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const ids = Array.isArray(input.ids) ? input.ids.map(String) : null;

  const { count } = await db.notification.updateMany({
    // The userId filter is what makes this safe — an id from another account
    // simply matches nothing.
    where: { userId: context.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ message: count === 0 ? "Nothing new." : `${count} marked as read.` });
}
