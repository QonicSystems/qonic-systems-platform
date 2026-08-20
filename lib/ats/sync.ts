import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Ensures all non-global candidate pool resources are synced into User (Admin People)
 * and all non-leadership staff Users are synced into Candidate (Candidate Pool).
 *
 * This runs automatically (no permission gate, no human in the loop) and can
 * create a real, login-capable account or change one's status — including
 * archiving it, which blocks sign-in. `actorId: null` marks these as
 * system-initiated in the audit log, same convention as the CLI password-reset
 * script, so "why did this account get archived" has an answer instead of a
 * silent gap — this same silent gap is exactly what made a real bug (an
 * archived Candidate quietly disabling the matching employee's account)
 * untraceable until someone dug through the code.
 */
export async function syncCandidateAndUsers(): Promise<void> {
  try {
    const employeeRole = await db.role.findFirst({ where: { key: "employee" } });
    if (!employeeRole) return;

    const [nonGlobalCandidates, staffUsers] = await Promise.all([
      db.candidate.findMany({
        where: {
          source: { not: "Global Visa Resource" },
        },
      }),
      db.user.findMany({
        where: {
          role: { key: { notIn: ["ceo", "co_founder"] } },
        },
        include: { role: true },
      }),
    ]);

    const userByEmail = new Map(staffUsers.map((u) => [u.email.toLowerCase().trim(), u]));
    const candidateByEmail = new Map(nonGlobalCandidates.map((c) => [c.email.toLowerCase().trim(), c]));

    const allEmails = new Set([...userByEmail.keys(), ...candidateByEmail.keys()]);

    for (const email of allEmails) {
      const c = candidateByEmail.get(email);
      const u = userByEmail.get(email);

      if (c && !u) {
        // Candidate exists without User: create User if active
        if (c.status === "ARCHIVED") continue;
        const created = await db.user.create({
          data: {
            email,
            name: c.name,
            phone: c.phone || null,
            jobTitle: c.headline || "Employee (Dev)",
            techStack: c.techStack || c.skills || null,
            roleId: employeeRole.id,
            status: "ACTIVE",
            mustChangePassword: true,
            passwordHash: "INVITED_CANDIDATE_NO_LOGIN_YET",
          },
        }).catch(() => null);
        if (created) {
          await recordAudit({ actorId: null, action: "sync.user.create", entityType: "User", entityId: created.id, after: { email, fromCandidateId: c.id } });
        }
      } else if (u && !c) {
        // User exists without Candidate: create Candidate if active
        if (u.status === "ARCHIVED") continue;
        const created = await db.candidate.create({
          data: {
            email,
            name: u.name,
            phone: u.phone || null,
            headline: u.jobTitle || "Employee (Dev)",
            techStack: u.techStack || null,
            skills: u.techStack || null,
            source: "Direct / Internal",
            benchStatus: "Available / Ready to Deploy",
            status: "ACTIVE",
            consentAt: new Date(),
          },
        }).catch(() => null);
        if (created) {
          await recordAudit({ actorId: null, action: "sync.candidate.create", entityType: "Candidate", entityId: created.id, after: { email, fromUserId: u.id } });
        }
      } else if (c && u) {
        // Both exist: reconcile based on which record was updated more recently
        if (c.updatedAt >= u.updatedAt) {
          // Candidate is newer -> update User
          const nextStatus = c.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED";
          if (
            u.name !== c.name ||
            u.phone !== (c.phone || null) ||
            u.techStack !== (c.techStack || c.skills) ||
            u.status !== nextStatus
          ) {
            const statusChanged = u.status !== nextStatus;
            await db.user.update({
              where: { id: u.id },
              data: {
                name: c.name,
                phone: c.phone || null,
                jobTitle: c.headline || u.jobTitle || "Employee (Dev)",
                techStack: c.techStack || c.skills || u.techStack,
                status: nextStatus,
              },
            }).catch(() => {});
            // A status flip changes login access — this is the one field
            // worth an audit entry on its own; a synced name/phone edit isn't.
            if (statusChanged) {
              await recordAudit({
                actorId: null, action: "sync.user.status", entityType: "User", entityId: u.id,
                before: { status: u.status }, after: { status: nextStatus, fromCandidateId: c.id },
              });
            }
          }
        } else {
          // User is newer -> update Candidate
          if (
            c.name !== u.name ||
            c.phone !== (u.phone || null) ||
            c.techStack !== u.techStack ||
            c.status !== u.status
          ) {
            await db.candidate.update({
              where: { id: c.id },
              data: {
                name: u.name,
                phone: u.phone || null,
                headline: u.jobTitle || c.headline || "Employee (Dev)",
                techStack: u.techStack || c.techStack,
                skills: u.techStack || c.skills,
                status: u.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
              },
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("Auto-sync error between Candidates and Users:", err);
  }
}
