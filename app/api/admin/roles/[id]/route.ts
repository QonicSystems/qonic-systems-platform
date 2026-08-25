import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute, type AuthContext } from "@/lib/auth/guard";
import { notify } from "@/lib/notify";
import {
  ROLE_DESCRIPTION_MAX,
  ROLE_LABEL_MAX,
  mayUseRank,
  validateRoleLabel,
  validateRoleRank,
  type RoleFieldErrors,
} from "@/lib/auth/role-input";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type RoleRecord = { id: string; label: string; rank: number; isSystem: boolean; isSuperAdmin: boolean };

/**
 * The two guards every write to a role shares, worded to match
 * app/api/admin/roles/[id]/permissions/route.ts.
 *
 * Returns a response to send, or null to continue.
 */
function refuseIfProtected(context: AuthContext, role: RoleRecord) {
  // The super admin's rights are unconditional and never read from these rows;
  // editing them would imply the CEO's own access is adjustable.
  if (role.isSuperAdmin) {
    return NextResponse.json({ message: "Super-admin access cannot be modified." }, { status: 409 });
  }
  if (!context.role.isSuperAdmin && role.rank <= context.role.rank) {
    return NextResponse.json({ message: "You cannot change a role at or above your own level." }, { status: 403 });
  }
  return null;
}

/**
 * Renames, re-describes, re-ranks, or re-flags a role.
 *
 * `key` is deliberately absent: the schema calls it "never renamed", and
 * SEEDED_ROLES, pruneRetiredRoles and the remaining role-key checks all match
 * on it. A rename would silently detach a role from all three.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  const { id } = await params;
  const role = await db.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ message: "That role no longer exists." }, { status: 404 });

  const refusal = refuseIfProtected(context, role);
  if (refusal) return refusal;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const label = String(input.label ?? role.label).trim().slice(0, ROLE_LABEL_MAX);
  const description = String(input.description ?? role.description ?? "").trim().slice(0, ROLE_DESCRIPTION_MAX);
  const rank = input.rank === undefined ? role.rank : Number(input.rank);
  // `viaCandidatePool` is deliberately not readable from the request. It marks
  // the one role the Candidate Pool assigns, it is owned by the seed, and it is
  // not something an edit here can move onto another role.

  const errors: RoleFieldErrors = {};
  const labelProblem = validateRoleLabel(label);
  if (labelProblem) errors.label = labelProblem;
  const rankProblem = validateRoleRank(rank);
  if (rankProblem) errors.rank = rankProblem;

  if (Object.keys(errors).length) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  const rankChanged = rank !== role.rank;

  // A built-in role's rank is re-applied by the deploy seed, so accepting an
  // edit here would silently revert on the next deploy. `label` and
  // `description` are deliberately left out of that sync and stay editable.
  if (role.isSystem && rankChanged) {
    return NextResponse.json({
      message: "Rank is fixed for built-in roles — the deploy seed re-applies it. You can still rename this role.",
    }, { status: 409 });
  }

  if (rankChanged && !mayUseRank(context, rank)) {
    return NextResponse.json({ message: "You cannot move a role to or above your own level." }, { status: 403 });
  }

  const holders = rankChanged
    ? await db.user.findMany({ where: { roleId: role.id }, select: { id: true } })
    : [];

  await db.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: role.id },
      data: { label, description: description || null, rank },
    });

    // Only a rank change alters what its holders may do — it is the input to
    // canAdminister and canAssignRole — so only a rank change forces
    // re-authentication. A rename must not sign anyone out.
    if (rankChanged) {
      await tx.session.deleteMany({ where: { userId: { in: holders.map((holder) => holder.id) } } });
      for (const holder of holders) {
        await notify({
          userId: holder.id,
          kind: "SYSTEM",
          title: `Your role's seniority changed`,
          body: "You were signed out so the change takes effect. Sign in again to continue.",
        }, tx);
      }
    }

    await recordAudit({
      actorId: context.user.id,
      action: "rbac.role.update",
      entityType: "Role",
      entityId: role.id,
      before: { label: role.label, description: role.description, rank: role.rank },
      after: { label, description: description || null, rank },
      ipAddress: clientIp(request),
    }, tx);
  });

  return NextResponse.json({
    message: rankChanged
      ? `${label} updated. ${holders.length} account${holders.length === 1 ? " was" : "s were"} signed out so the new seniority takes effect.`
      : `${label} updated.`,
  });
}

/**
 * Deletes a role, permanently.
 *
 * Custom roles only. Three cases are refused:
 *
 * - A **built-in** role (CEO & Founder, Co-Founder, Developer). prisma/seed.ts
 *   upserts all three on every run, so a delete would be undone by the next
 *   deploy anyway — but the real reason is Developer: it is the role the
 *   Candidate Pool assigns, and without it staff onboarding has nothing to hand
 *   out. Deleting it once already left onboarding silently pointing at whichever
 *   other role happened to carry the flag.
 * - The **super-admin** role, which is also built-in: `isSuperAdmin` is the
 *   unconditional allow-all in resolvePermissions, so deleting it removes the one
 *   access that can never be locked out — and it belongs to the caller.
 * - A role **somebody still holds**: `User.roleId` is a required relation, so the
 *   delete would fail on the foreign key regardless. Silently reassigning them,
 *   as the unattended deploy seed must, is the wrong call for a deliberate
 *   interactive action — a clear refusal lets the CEO choose where they go.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  const { id } = await params;
  const role = await db.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ message: "That role no longer exists." }, { status: 404 });

  if (role.isSuperAdmin) {
    return NextResponse.json({
      message: "The super-admin role cannot be deleted — it is the only access that can never be locked out, and it is yours.",
    }, { status: 409 });
  }
  if (role.isSystem) {
    return NextResponse.json({
      message: `${role.label} is a built-in role and cannot be deleted. Only roles you create here can be.`,
    }, { status: 409 });
  }

  const refusal = refuseIfProtected(context, role);
  if (refusal) return refusal;

  const holders = await db.user.count({ where: { roleId: role.id } });
  if (holders > 0) {
    return NextResponse.json({
      message: holders === 1
        ? "1 account still holds this role. Move them to another role first."
        : `${holders} accounts still hold this role. Move them to another role first.`,
    }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    // Audited before the delete, so the entry is written while the row it
    // describes still exists.
    await recordAudit({
      actorId: context.user.id,
      action: "rbac.role.delete",
      entityType: "Role",
      entityId: role.id,
      before: { key: role.key, label: role.label, rank: role.rank },
      after: null,
      ipAddress: clientIp(request),
    }, tx);

    // RolePermission cascades with the role. UserPermissionOverride is keyed on
    // userId, not roleId, so nothing dangles once the holder count is zero.
    await tx.role.delete({ where: { id: role.id } });
  });

  return NextResponse.json({ message: `${role.label} deleted.` });
}
