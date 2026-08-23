import Link from "next/link";
import { GlobalAgreementForm } from "@/components/ats/global-agreement-form";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Issue Global Candidate Agreement" };

export default async function NewGlobalAgreementPage({ searchParams }: { searchParams: Promise<{ candidateId?: string }> }) {
  await requirePermission("contract.release");
  const { candidateId } = await searchParams;
  const candidate = candidateId ? await db.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, name: true, email: true, kind: true, status: true, consentStatus: true, location: true, skills: true, techStack: true },
  }) : null;

  if (!candidate || candidate.kind !== "GLOBAL" || candidate.status !== "ACTIVE") {
    return <div className="portal-page portal-page--narrow">
      <header className="portal-page-head"><p className="eyebrow">Recruitment</p><h1 className="portal-title">Issue Global Candidate agreement</h1></header>
      <div className="portal-panel p-6"><p className="portal-note">Choose an active Global Candidate from the Candidate Pool first.</p><p className="mt-3"><Link className="text-link" href="/candidates">Back to Candidate Pool</Link></p></div>
    </div>;
  }

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Recruitment · External representation</p>
      <h1 className="portal-title">Issue Global Candidate agreement</h1>
      <p className="portal-lead">A reusable master agreement for {candidate.name}; it is separate from employment contracts and does not grant a portal account.</p>
    </header>
    <section className="portal-panel p-6"><GlobalAgreementForm candidate={{
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      location: candidate.location ?? "",
      skills: candidate.skills ?? candidate.techStack ?? "",
      consented: candidate.consentStatus === "CONSENTED",
    }} /></section>
  </div>;
}
