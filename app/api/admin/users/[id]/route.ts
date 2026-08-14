import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister, canAssignRole, canChangeOwnRole, canEditIdentity } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type UserErrors = Partial<Record<"name" | "email" | "phone" | "jobTitle" | "roleId", string>>;

const withRole = { role: { select: { key: true, rank: true, isSuperAdmin: true, label: true } } } as const;

/** Edit a colleague's profile. Requires user.manage plus seniority over them. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.manage");
  if (response) return response;

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id }, include: withRole });
  if (!target) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canEditIdentity(context, target);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const data = {
    name: String(input.name ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    phone: String(input.phone ?? "").trim(),
    jobTitle: String(input.jobTitle ?? "").trim(),
    roleId: String(input.roleId ?? "").trim(),
  };

  const errors: UserErrors = {};
  if (data.name.length < 2) errors.name = "Please enter a name with at least 2 characters.";
  if (!emailPattern.test(data.email)) errors.email = "Please enter a valid email address.";
  if (data.phone && !/^[+\d][\d\s()-]{5,}$/.test(data.phone)) errors.phone = "Please enter a valid phone number.";
  if (!data.roleId) errors.roleId = "Please choose a role.";

  const nextRole = data.roleId ? await db.role.findUnique({ where: { id: data.roleId } }) : null;
  if (data.roleId && !nextRole) errors.roleId = "That role no longer exists.";

  // Email is an identity, so a collision must be reported rather than silently 500.
  if (!errors.email) {
    const clash = await db.user.findUnique({ where: { email: data.email } });
    if (clash && clash.id !== target.id) errors.email = "Another account already uses that email address.";
  }

  if (Object.keys(errors).length) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });

  const roleChanged = nextRole!.id !== target.roleId;

  // Self-edits are permitted for identity but never for role, so this is
  // checked separately from canAdminister rather than folded into it.
  const ownRole = canChangeOwnRole(context, target, roleChanged);
  if (!ownRole.ok) return NextResponse.json({ message: ownRole.reason }, { status: ownRole.status });

  if (roleChanged) {
    const assignable = canAssignRole(context, nextRole!);
    if (!assignable.ok) return NextResponse.json({ message: assignable.reason }, { status: assignable.status });
  }

  const before = { name: target.name, email: target.email, phone: target.phone, jobTitle: target.jobTitle, role: target.role.key };
  const after = { name: data.name, email: data.email, phone: data.phone || null, jobTitle: data.jobTitle || null, role: nextRole!.key };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { name: data.name, email: data.email, phone: data.phone || null, jobTitle: data.jobTitle || null, roleId: nextRole!.id },
    });
    // A role change is a large enough authority shift to require re-authentication,
    // so every existing session for that person is dropped.
    if (roleChanged) await tx.session.deleteMany({ where: { userId: target.id } });
    await recordAudit({ actorId: context.user.id, action: roleChanged ? "user.update.role" : "user.update", entityType: "User", entityId: target.id, before, after, ipAddress: clientIp(request) }, tx);
  });

  return NextResponse.json({ message: roleChanged ? `${data.name} updated and signed out to re-authenticate.` : `${data.name} updated.` });
}

/** Permanently remove an account. Requires user.delete — super admin only by default. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.delete");
  if (response) return response;

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id }, include: withRole });
  if (!target) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canAdminister(context, target);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  // Contract letters are legal records naming this person. Deleting the account
  // would break that history, so removal is refused and deactivation suggested.
  const contracts = await db.contractLetter.count({ where: { OR: [{ subjectUserId: target.id }, { authorUserId: target.id }] } });
  if (contracts > 0) {
    return NextResponse.json({
      message: `${target.name} has ${contracts} contract letter${contracts === 1 ? "" : "s"} on record and cannot be removed. Deactivate the account instead to preserve the paperwork.`,
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    // Audit first: the row survives the delete because AuditLog.actor is SetNull
    // and we record the subject in `before` rather than as a relation.
    await recordAudit({
      actorId: context.user.id,
      action: "user.delete",
      entityType: "User",
      entityId: target.id,
      before: { name: target.name, email: target.email, role: target.role.key },
      ipAddress: clientIp(request),
    }, tx);
    await tx.user.delete({ where: { id: target.id } }); // sessions/overrides cascade
  });

  return NextResponse.json({ message: `${target.name} has been removed.` });
}
