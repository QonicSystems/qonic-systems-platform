import Link from "next/link";
import { BankForm } from "@/components/portal/bank-form";
import { ProfileForm } from "@/components/portal/profile-form";
import type { ContractPayload } from "@/lib/contracts/payload";
import { requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const context = await requireAuth();
  const record = await db.user.findUniqueOrThrow({
    where: { id: context.user.id },
    select: { address: true, emergencyName: true, emergencyPhone: true, emergencyRelation: true },
  });

  // Employment type is a term of the contract, not a field on the person —
  // it lives in the frozen payload of whichever letter last set it, not on
  // User (see docs/ROADMAP.md: letters are immutable once issued). Read-only
  // here; changing it means issuing a new letter, not editing a profile field.
  const latestLetter = await db.contractLetter.findFirst({
    where: { subjectUserId: context.user.id, status: { in: ["RELEASED", "ACKNOWLEDGED"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, payload: true },
  });
  const employmentType = latestLetter ? (latestLetter.payload as unknown as ContractPayload).employmentType : null;

  // Only the non-secret half is ever loaded — the encrypted columns are not
  // selected, so an account number cannot leak into a page payload.
  const bank = await db.bankDetail.findUnique({
    where: { userId: context.user.id },
    select: { lastFour: true, bankName: true, updatedAt: true },
  });

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">{context.role.label}</p>
      <h1 className="portal-title">My Profile</h1>
      <p className="portal-lead">Update how you appear to the rest of the team.</p>
      {employmentType && <p className="portal-note">
        Employment type: <strong>{employmentType}</strong> — from your{" "}
        <Link className="text-link" href={`/contracts/${latestLetter!.id}`}>most recent contract letter</Link>.
      </p>}
    </header>

    <section className="portal-panel">
      <ProfileForm initial={{
        name: context.user.name,
        email: context.user.email,
        phone: context.user.phone ?? "",
        jobTitle: context.user.jobTitle ?? "",
        photoUrl: context.user.photoUrl ?? "",
        address: record.address ?? "",
        emergencyName: record.emergencyName ?? "",
        emergencyPhone: record.emergencyPhone ?? "",
        emergencyRelation: record.emergencyRelation ?? "",
      }} />
    </section>

    <section className="portal-panel mt-6">
      <h2 className="portal-section-title">Reimbursement account</h2>
      <p className="portal-note">Where approved expense claims are paid out to. Only you can see or change this.</p>
      <BankForm onFile={bank ? {
        lastFour: bank.lastFour,
        bankName: bank.bankName ?? "",
        updatedAt: bank.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      } : null} />
    </section>

    <p className="portal-note">
      Want to change your password? Go to <Link className="text-link" href="/profile/security">account security</Link>.
    </p>
  </div>;
}
