import Link from "next/link";
import { ContractLetterTable } from "@/components/contracts/contract-letter-table";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Contract Letters" };

export default async function ContractsPage() {
  const context = await requirePermission("contract.view_own");
  const viewAll = can(context, "contract.view_all");

  // Everyone sees their own letters; the broader grant adds everyone else's,
  // and an author always sees what they drafted.
  const letters = await db.contractLetter.findMany({
    where: viewAll ? {} : { OR: [{ subjectUserId: context.user.id }, { authorUserId: context.user.id }] },
    include: { subject: true, author: true },
    orderBy: { createdAt: "desc" },
  });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Contract Letters</p>
      <h1 className="portal-title">{viewAll ? "All contract letters" : "My contract letters"}</h1>
      <p className="portal-lead">
        {can(context, "contract.generate")
          ? "Draft a letter, then send it to leadership for release."
          : "Letters issued to you appear here once leadership has released them."}
      </p>
    </header>

    {can(context, "contract.generate") && <p>
      <Link href="/contracts/new" className="button button-primary">Draft a new letter</Link>
    </p>}

    <ContractLetterTable letters={letters.map((letter) => ({
      id: letter.id,
      reference: letter.reference,
      author: letter.author.name,
      subject: letter.subject.name,
      jobTitle: (letter.payload as { jobTitle?: string }).jobTitle ?? "—",
      status: letter.status,
      updated: letter.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    }))} />
  </div>;
}
