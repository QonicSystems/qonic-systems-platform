import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { guardRoute } from "@/lib/auth/guard";
import {
  ROLE_DESCRIPTION_MAX,
  ROLE_LABEL_MAX,
  mayUseRank,
  roleKeyFrom,
  validateRoleLabel,
  validateRoleRank,
  type RoleFieldErrors,
} from "@/lib/auth/role-input";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Longest suffix chain tried before giving up on a colliding key. */
const MAX_KEY_ATTEMPTS = 50;

/**
 * Finds a free `key` for a new role.
 *
 * Collisions are real: "Legal" and "Legal & Compliance" both slug to something
 * starting `legal`, and a role deleted and recreated by hand will collide with
 * itself. Suffixing beats rejecting — the CEO chose a label, not a key, and
 * should not have to invent a different name to work around a column they never
 * see.
 */
async function availableKey(base: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt += 1) {
    const key = attempt === 1 ? base : `${base}_${attempt}`;
    if (!(await db.role.findUnique({ where: { key }, select: { id: true } }))) return key;
  }
  return null;
}

/**
 * Creates a role.
 *
 * Roles are rows precisely so this needs no migration and no deploy — see the
 * design note at the top of prisma/schema.prisma. What the endpoint adds is the
 * guard rail: a created role can never be a super admin, can never be a system
 * role, and can never outrank the person creating it.
 */
export async function POST(request: Request) {
  const { context, response } = await guardRoute("rbac.manage");
  if (response) return response;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  const label = String(input.label ?? "").trim().slice(0, ROLE_LABEL_MAX);
  const description = String(input.description ?? "").trim().slice(0, ROLE_DESCRIPTION_MAX);
  const rank = Number(input.rank);

  const errors: RoleFieldErrors = {};
  const labelProblem = validateRoleLabel(label);
  if (labelProblem) errors.label = labelProblem;
  const rankProblem = validateRoleRank(rank);
  if (rankProblem) errors.rank = rankProblem;

  if (Object.keys(errors).length) {
    return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  }

  if (!mayUseRank(context, rank)) {
    return NextResponse.json({ message: "You cannot create a role at or above your own level." }, { status: 403 });
  }

  const key = await availableKey(roleKeyFrom(label));
  if (!key) {
    return NextResponse.json({
      message: "Please correct the highlighted fields.",
      errors: { label: "A role with a very similar name already exists. Try a more distinct name." },
    }, { status: 409 });
  }

  const role = await db.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        key,
        label,
        description: description || null,
        rank,
        // None of these three is settable by a caller.
        //
        // `isSuperAdmin` is an unconditional allow-all in resolvePermissions.
        //
        // `isSystem: true` would put the role in pruneRetiredRoles' sights —
        // that function deletes every system role absent from SEEDED_ROLES and
        // moves its holders to Developer, so a hand-made role marked system is
        // destroyed by the next `npm run db:seed`.
        //
        // `viaCandidatePool` belongs to the seeded Developer role alone. It was
        // briefly offered as a checkbox here, and a role created with it ticked
        // vanished from Administration → People (that dropdown hides Candidate
        // Pool roles) *and* became what "Create Employee Account" handed out.
        // Every role created here is a People role.
        isSuperAdmin: false,
        isSystem: false,
        viaCandidatePool: false,
      },
    });

    // No RolePermission rows are pre-created. The matrix renders a missing row
    // as off and the toggle endpoint upserts, so a new role still starts with
    // nothing — but writing them here was actively harmful: prisma/seed.ts
    // backfills only MISSING rows, deliberately never overwriting a toggle the
    // CEO has set. Pre-creating 38 disabled rows looked exactly like 38
    // deliberate choices, so re-creating a deleted built-in role (Co-Founder,
    // say) brought it back permanently stripped of the defaults the seed would
    // otherwise have given it.

    await recordAudit({
      actorId: context.user.id,
      action: "rbac.role.create",
      entityType: "Role",
      entityId: created.id,
      after: { key, label, rank },
      ipAddress: clientIp(request),
    }, tx);

    return created;
  });

  return NextResponse.json({
    message: `${role.label} created. It has no capabilities yet — switch them on in Roles & Permissions.`,
    id: role.id,
  });
}
