import Link from "next/link";
import { ContractForm } from "@/components/contracts/contract-form";
import { canAdminister } from "@/lib/auth/authority";
import { requirePermission } from "@/lib/auth/guard";
import { nonLeadershipRoleWhere } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const metadata = { title: "Draft a Contract Letter" };

/**
 * Drafting a contract letter.
 *
 * Arriving with `?candidateId=` preselects that candidate's staff account. It is
 * a READ: this page used to create the User and write the Candidate → User link
 * itself, during a GET render, so a prefetch or a refresh of this URL inserted
 * rows. Creating the account is now its own deliberate action in the Candidate
 * Pool (POST /api/candidates/[id]/employee), and this page only reads the link
 * that action wrote.
 */
export default async function NewContractPage({
  searchParams,
}: {
  searchParams?: Promise<{ candidateId?: string }>;
}) {
  const context = await requirePermission("contract.generate");
  const params = searchParams ? await searchParams : {};
  const candidateId = params?.candidateId;

  const candidate = candidateId
    ? await db.candidate.findUnique({
        where: { id: candidateId },
        select: { name: true, linkedUserId: true },
      })
    : null;
  const initialSubjectId = candidate?.linkedUserId ?? "";

  // The eligible list is strictly for non-leadership staff (Developers)
  // that the current user can administer. Founder and Co-Founder are excluded.
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: nonLeadershipRoleWhere,
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

    {candidate && !candidate.linkedUserId && <div className="portal-panel p-6 mb-4">
      <p className="portal-note">
        {candidate.name} does not have a staff account yet, so there is nobody to address this letter to.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Use <strong>Create Employee Account</strong> on their row in the{" "}
        <Link className="text-link font-semibold" href="/candidates">Candidate Pool</Link>, then come back here.
      </p>
    </div>}

    {employees.length === 0
      ? <div className="portal-panel p-6">
          <p className="portal-note">
            There are currently no delivery team members in the workspace.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Employee accounts start in the{" "}
            <Link className="text-link font-semibold" href="/candidates">Candidate Pool</Link> — add the candidate
            there, then create their employee account.
          </p>
        </div>
      : <section className="portal-panel">
          <ContractForm employees={employees} initialSubjectId={initialSubjectId} />
        </section>}

    <p className="mt-4"><Link className="text-link" href="/contracts">Back to contract letters</Link></p>
  </div>;
}
