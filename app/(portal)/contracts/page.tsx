import Link from "next/link";
import { can, requirePermission } from "@/lib/auth/guard";
import { describeStatus } from "@/lib/contracts/workflow";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/status-chip";

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

    {letters.length === 0 ? <p className="portal-note">No contract letters yet.</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr><th scope="col">Reference</th><th scope="col">Employee</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col">Updated</th></tr>
        </thead>
        <tbody>
          {letters.map((letter) => {
            const payload = letter.payload as { jobTitle?: string };
            return <tr key={letter.id}>
              <th scope="row">
                <Link className="text-link" href={`/contracts/${letter.id}`}>{letter.reference}</Link>
                <span>Drafted by {letter.author.name}</span>
              </th>
              <td>{letter.subject.name}</td>
              <td>{payload.jobTitle ?? "—"}</td>
              <td><StatusChip status={letter.status} label={describeStatus(letter.status)} /></td>
              <td>{letter.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
  </div>;
}
