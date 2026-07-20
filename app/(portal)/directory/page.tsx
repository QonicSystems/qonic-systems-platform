import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Team Directory" };

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

export default async function DirectoryPage() {
  await requirePermission("directory.view");

  const people = await db.user.findMany({
    where: { status: "ACTIVE" },
    include: { role: true },
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
        <span className="avatar">{initialsOf(person.name)}</span>
        <div>
          <strong>{person.name}</strong>
          <p>{person.jobTitle ?? person.role.label}</p>
          <a className="text-link" href={`mailto:${person.email}`}>{person.email}</a>
          {person.phone && <p className="portal-muted">{person.phone}</p>}
        </div>
      </article>)}
    </div>
  </div>;
}
