import Link from "next/link";
import { ContractForm } from "@/components/contracts/contract-form";
import { recordAudit } from "@/lib/audit";
import { canAdminister } from "@/lib/auth/authority";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Draft a Contract Letter" };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams?: Promise<{ candidateId?: string; name?: string; email?: string }>;
}) {
  const context = await requirePermission("contract.generate");
  const params = searchParams ? await searchParams : {};
  const candidateId = params?.candidateId;
  const queryName = params?.name;
  const queryEmail = params?.email;

  let initialSubjectId = "";

  // If navigated from Candidate Pool, ensure the candidate has an Employee (Dev) account
  if (candidateId || queryEmail) {
    const candidate = candidateId ? await db.candidate.findUnique({ where: { id: candidateId } }) : null;
    const emailToUse = (candidate?.email ?? queryEmail ?? "").trim().toLowerCase();
    const nameToUse = (candidate?.name ?? queryName ?? "").trim();

    if (emailToUse && nameToUse) {
      let candidateUser = await db.user.findUnique({ where: { email: emailToUse } });
      if (!candidateUser) {
        const employeeRole = await db.role.findFirst({ where: { key: "employee" } });
        if (employeeRole) {
          candidateUser = await db.user.create({
            data: {
              email: emailToUse,
              name: nameToUse,
              roleId: employeeRole.id,
              status: "ACTIVE",
              mustChangePassword: true,
              techStack: candidate?.techStack ?? null,
              phone: candidate?.phone ?? null,
              passwordHash: "INVITED_CANDIDATE_NO_LOGIN_YET",
            },
          });
        }
      }
      if (candidateUser) {
        initialSubjectId = candidateUser.id;

        // This is the one deliberate moment a Candidate becomes a linked User —
        // drafting their first contract letter — so it's recorded here, once,
        // rather than guessed later by matching email strings.
        if (candidate && candidate.linkedUserId !== candidateUser.id) {
          await db.candidate.update({ where: { id: candidate.id }, data: { linkedUserId: candidateUser.id } });
          await recordAudit({
            actorId: context.user.id,
            action: "candidate.link",
            entityType: "Candidate",
            entityId: candidate.id,
            before: { linkedUserId: candidate.linkedUserId },
            after: { linkedUserId: candidateUser.id },
          });
        }
      }
    }
  }

  // The eligible list is strictly for non-leadership employees (Employee Devs)
  // that the current user can administer. Founder and Co-Founder are excluded.
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { notIn: ["ceo", "co_founder"] } },
    },
    include: { role: true },
    orderBy: { name: "asc" },
  });
  const employees = users
    .filter((user) => canAdminister(context, user).ok)
    .map((user) => ({ id: user.id, name: `${user.name} (${user.email})`, roleLabel: user.role.label }));

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Contract Letters</p>
      <h1 className="portal-title">Draft a contract letter</h1>
      <p className="portal-lead">Fill in the terms, then submit it to leadership for release.</p>
    </header>

    {employees.length === 0
      ? <div className="portal-panel p-6">
          <p className="portal-note">
            There are currently no Employee (Dev) team members in the workspace.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            You can <Link className="text-link font-semibold" href="/candidates">select a candidate from the Candidate Pool</Link> to generate their contract, or <Link className="text-link font-semibold" href="/admin">add an Employee in Administration</Link>.
          </p>
        </div>
      : <section className="portal-panel">
          <ContractForm employees={employees} initialSubjectId={initialSubjectId} />
        </section>}

    <p className="mt-4"><Link className="text-link" href="/contracts">Back to contract letters</Link></p>
  </div>;
}
