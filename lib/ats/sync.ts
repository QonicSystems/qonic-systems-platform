import { db } from "@/lib/db";

/**
 * Ensures all non-global candidate pool resources are synced into User (Admin People)
 * and all non-leadership staff Users are synced into Candidate (Candidate Pool).
 */
export async function syncCandidateAndUsers(): Promise<void> {
  try {
    const [employeeRole, nonGlobalCandidates, staffUsers] = await Promise.all([
      db.role.findFirst({ where: { key: "employee" } }),
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

    if (!employeeRole) return;

    // 1. Sync Candidate Pool -> Admin People (User)
    for (const c of nonGlobalCandidates) {
      const email = c.email.toLowerCase().trim();
      const existingUser = staffUsers.find((u) => u.email.toLowerCase().trim() === email);
      if (!existingUser) {
        await db.user.create({
          data: {
            email,
            name: c.name,
            phone: c.phone || null,
            jobTitle: c.headline || "Employee (Dev)",
            techStack: c.techStack || c.skills || null,
            roleId: employeeRole.id,
            status: c.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
            mustChangePassword: true,
            passwordHash: "INVITED_CANDIDATE_NO_LOGIN_YET",
          },
        }).catch(() => {});
      } else {
        // Sync attributes if changed
        if (
          existingUser.name !== c.name ||
          existingUser.techStack !== (c.techStack || c.skills) ||
          existingUser.phone !== (c.phone || null)
        ) {
          await db.user.update({
            where: { id: existingUser.id },
            data: {
              name: c.name,
              phone: c.phone || null,
              jobTitle: c.headline || existingUser.jobTitle || "Employee (Dev)",
              techStack: c.techStack || c.skills || existingUser.techStack,
            },
          }).catch(() => {});
        }
      }
    }

    // 2. Sync Admin People (User) -> Candidate Pool (Candidate)
    for (const u of staffUsers) {
      const email = u.email.toLowerCase().trim();
      const existingCandidate = nonGlobalCandidates.find((c) => c.email.toLowerCase().trim() === email);
      if (!existingCandidate) {
        await db.candidate.create({
          data: {
            email,
            name: u.name,
            phone: u.phone || null,
            headline: u.jobTitle || "Employee (Dev)",
            techStack: u.techStack || null,
            skills: u.techStack || null,
            source: "Direct / Internal",
            benchStatus: "Available / Ready to Deploy",
            status: u.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
            consentAt: new Date(),
          },
        }).catch(() => {});
      } else {
        // Sync attributes if changed
        if (
          existingCandidate.name !== u.name ||
          existingCandidate.techStack !== u.techStack ||
          existingCandidate.phone !== (u.phone || null)
        ) {
          await db.candidate.update({
            where: { id: existingCandidate.id },
            data: {
              name: u.name,
              phone: u.phone || null,
              headline: u.jobTitle || existingCandidate.headline || "Employee (Dev)",
              techStack: u.techStack || existingCandidate.techStack,
              skills: u.techStack || existingCandidate.skills,
            },
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    // Non-blocking sync log
    console.error("Auto-sync error between Candidates and Users:", err);
  }
}
