import Link from "next/link";
import { ContractForm } from "@/components/contracts/contract-form";
import { canAdminister } from "@/lib/auth/authority";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Draft a Contract Letter" };

export default async function NewContractPage() {
  const context = await requirePermission("contract.generate");

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
    .map((user) => ({ id: user.id, name: user.name, roleLabel: user.role.label }));

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Contract Letters</p>
      <h1 className="portal-title">Draft a contract letter</h1>
      <p className="portal-lead">Fill in the terms, then submit it to leadership for release.</p>
    </header>

    {employees.length === 0
      ? <p className="portal-note">There is nobody you can draft a letter for. You can only do so for people in roles junior to your own.</p>
      : <section className="portal-panel"><ContractForm employees={employees} /></section>}

    <p><Link className="text-link" href="/contracts">Back to contract letters</Link></p>
  </div>;
}
