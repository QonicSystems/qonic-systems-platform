import { NextResponse } from "next/server";
import { clientIp, recordAudit } from "@/lib/audit";
import { canAdminister, canAssignRole, canChangeOwnRole, canEditIdentity } from "@/lib/auth/authority";
import { guardRoute } from "@/lib/auth/guard";
import { emailPattern } from "@/lib/contact";
import { syncCandidateAndUsers } from "@/lib/ats/sync";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isRecordNotFound, isUniqueEmailViolation } from "@/lib/db-errors";
import { notify } from "@/lib/notify";

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

  // Same caps as the create route — otherwise the identical field is stored at
  // one length when added and another when edited.
  const data = {
    name: String(input.name ?? "").trim().slice(0, 200),
    email: String(input.email ?? "").trim().toLowerCase().slice(0, 320),
    phone: String(input.phone ?? "").trim().slice(0, 50),
    jobTitle: String(input.jobTitle ?? "").trim().slice(0, 200),
    techStack: String(input.techStack ?? "").trim().slice(0, 500),
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

  const before = { name: target.name, email: target.email, phone: target.phone, jobTitle: target.jobTitle, role: target.role.key, techStack: target.techStack };
  const after = { name: data.name, email: data.email, phone: data.phone || null, jobTitle: data.jobTitle || null, role: nextRole!.key, techStack: data.techStack || null };

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          jobTitle: data.jobTitle || null,
          techStack: data.techStack || null,
          roleId: nextRole!.id,
        },
      });
    // A role change is a large enough authority shift to require re-authentication,
    // so every existing session for that person is dropped.
    if (roleChanged) {
      await tx.session.deleteMany({ where: { userId: target.id } });
      // Being signed out mid-task with no explanation reads as a bug. The
      // notification survives the session drop and is waiting on next sign-in.
      await notify({
        userId: target.id,
        kind: "SYSTEM",
        title: `Your role is now ${nextRole!.label}`,
        body: "You were signed out so the change takes effect. Sign in again to continue.",
      }, tx);
    }
    await recordAudit({ actorId: context.user.id, action: roleChanged ? "user.update.role" : "user.update", entityType: "User", entityId: target.id, before, after, ipAddress: clientIp(request) }, tx);
    });
  } catch (error) {
    // The uniqueness pre-check above is a read, so a concurrent write can still
    // land between it and this update. Report it as the field error the caller
    // already knows how to render rather than a 500.
    if (isUniqueEmailViolation(error)) {
      return NextResponse.json({ message: "Please correct the highlighted fields.", errors: { email: "Another account already uses that email address." } }, { status: 422 });
    }
    throw error;
  }

  await syncCandidateAndUsers();

  return NextResponse.json({ message: roleChanged ? `${data.name} updated and signed out to re-authenticate.` : `${data.name} updated.` });
}

/** Remove an account by archiving it. Requires user.delete — super admin only by default. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await guardRoute("user.delete");
  if (response) return response;

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id }, include: withRole });
  if (!target) return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });

  const authority = canAdminister(context, target);
  if (!authority.ok) return NextResponse.json({ message: authority.reason }, { status: authority.status });

  // If the user is already ARCHIVED, only Founder & CEO (Super Admin) can permanently delete
  if (target.status === "ARCHIVED") {
    if (!context.role.isSuperAdmin) {
      return NextResponse.json(
        { message: "Only the Founder & CEO has the authority to permanently delete archived users and purge their associated data." },
        { status: 403 }
      );
    }

    try {
      await db.$transaction(async (tx) => {
        // 1. Invalidate sessions and tokens
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });

        // 2. Contract letters and events
        await tx.contractLetterEvent.deleteMany({
          where: { letter: { OR: [{ subjectUserId: target.id }, { authorUserId: target.id }] } },
        });
        await tx.contractLetter.deleteMany({
          where: { OR: [{ subjectUserId: target.id }, { authorUserId: target.id }] },
        });

        // 3. Time entries and timesheets
        await tx.timeEntry.deleteMany({ where: { timesheet: { userId: target.id } } });
        await tx.timesheet.deleteMany({ where: { userId: target.id } });

        // 4. Expenses & Assignments
        await tx.expense.deleteMany({ where: { userId: target.id } });
        await tx.projectAssignment.deleteMany({ where: { userId: target.id } });

        // 5. Unassign from managed projects, clients, reports, and placements
        await tx.project.updateMany({ where: { managerId: target.id }, data: { managerId: null } });
        await tx.client.updateMany({ where: { ownerId: target.id }, data: { ownerId: null } });
        await tx.user.updateMany({ where: { managerId: target.id }, data: { managerId: null } });
        await tx.placement.updateMany({ where: { recruiterId: target.id }, data: { recruiterId: null } });

        // 6. Leave requests, notifications, permission overrides
        await tx.leaveRequest.deleteMany({ where: { userId: target.id } });
        await tx.notification.deleteMany({ where: { userId: target.id } });
        await tx.userPermissionOverride.deleteMany({ where: { userId: target.id } });

        // 7. Permanently delete the user
        await tx.user.delete({ where: { id: target.id } });

        // 8. Record audit log
        await recordAudit({
          actorId: context.user.id,
          action: "user.purge_permanent",
          entityType: "User",
          entityId: target.id,
          before: { name: target.name, email: target.email, role: target.role.key, status: target.status },
          after: null,
          ipAddress: clientIp(request),
        }, tx);
      });

      return NextResponse.json({ message: `${target.name} and all associated records have been permanently deleted.` });
    } catch (error) {
      if (isRecordNotFound(error)) {
        return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });
      }
      throw error;
    }
  }

  try {
    await db.$transaction(async (tx) => {
      // 1. Invalidate all active sessions and pending reset tokens immediately
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });

      // 2. Archive user, revoke portal access, and record departure date while preserving all history
      await tx.user.update({
        where: { id: target.id },
        data: {
          status: "ARCHIVED",
          leftOn: target.leftOn ?? new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      // 3. Record audit log
      await recordAudit({
        actorId: context.user.id,
        action: "user.archive",
        entityType: "User",
        entityId: target.id,
        before: { name: target.name, email: target.email, role: target.role.key, status: target.status },
        after: { status: "ARCHIVED" },
        ipAddress: clientIp(request),
      }, tx);
    });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return NextResponse.json({ message: "That account no longer exists." }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ message: `${target.name} has been moved to Archived with all history preserved.` });
}
