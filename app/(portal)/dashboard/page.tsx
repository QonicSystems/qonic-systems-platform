import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Dashboard" };

const shortDate = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const context = await requireAuth();
  const denied = (await searchParams).denied === "1";

  const [teamCount, myContracts, openLeave, recentContracts] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.contractLetter.count({ where: { subjectUserId: context.user.id } }),
    db.leaveRequest.count({ where: { userId: context.user.id, status: "PENDING" } }),
    // Own letters only — the full list lives behind contract.view_all.
    db.contractLetter.findMany({
      where: { subjectUserId: context.user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, reference: true, status: true, updatedAt: true },
    }),
  ]);

  return <>
    {denied && <p className="form-status form-status--error" role="alert">You do not have permission to view that page.</p>}

    <div className="portal-grid">
      <article className="portal-card"><span className="portal-stat">{teamCount}</span><p>Active team members</p></article>
      <article className="portal-card"><span className="portal-stat">{myContracts}</span><p>My contract letters</p></article>
      <article className="portal-card"><span className="portal-stat">{openLeave}</span><p>My leave requests awaiting a decision</p></article>
    </div>

    <section className="portal-section">
      <h2 className="portal-section-title">Your recent contract letters</h2>
      {recentContracts.length === 0
        ? <p className="portal-note">Nothing yet. Letters issued to you will appear here.</p>
        : <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead><tr><th scope="col">Letter</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {recentContracts.map((letter) => <tr key={letter.id}>
                  <th scope="row"><strong>{letter.reference}</strong></th>
                  <td><StatusChip status={letter.status} /></td>
                  <td>{shortDate(letter.updatedAt)}</td>
                  <td><div className="row-actions"><Link className="row-action" href={`/contracts/${letter.id}`}>View</Link></div></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  </>;
}
