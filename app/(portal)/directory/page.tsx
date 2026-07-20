import { Avatar } from "@/components/portal/avatar";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Team Directory" };

export default async function DirectoryPage() {
  await requirePermission("directory.view");

  const people = await db.user.findMany({
    where: { status: "ACTIVE" },
    include: { role: true, manager: { select: { name: true } } },
    orderBy: [{ role: { rank: "asc" } }, { name: "asc" }],
  });

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Team</p>
      <h1 className="portal-title">Directory</h1>
      <p className="portal-lead">Everyone currently active in the workspace.</p>
    </header>

    <div className="portal-grid">
      {people.map((person) => <article key={person.id} className="portal-card portal-card--person">
        <Avatar name={person.name} photoUrl={person.photoUrl} size={48} />
        <div>
          <strong>{person.name}</strong>
          <p>{person.jobTitle ?? person.role.label}</p>
          <a className="text-link" href={`mailto:${person.email}`}>{person.email}</a>
          {person.phone && <p className="portal-muted">{person.phone}</p>}
          {person.manager && <p className="portal-muted">Reports to {person.manager.name}</p>}
        </div>
      </article>)}
    </div>
  </div>;
}
