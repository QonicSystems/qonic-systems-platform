import { DirectoryList } from "@/components/portal/directory-list";
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

  // Rank order (already the query's own sort) doubles as a sensible display
  // order for the hero-stats — leadership first, then descending seniority.
  const roleCounts: { label: string; count: number }[] = [];
  for (const person of people) {
    const existing = roleCounts.find((r) => r.label === person.role.label);
    if (existing) existing.count += 1; else roleCounts.push({ label: person.role.label, count: 1 });
  }

  return <div className="portal-page">
    <div className="hero-panel">
      <span className="hero-eyebrow">Team</span>
      <h1 className="hero-title">Directory</h1>
      <p className="hero-lead">Everyone currently active in the workspace.</p>
      <div className="hero-stats">
        <div>
          <span className="hero-stat-value">{people.length}</span>
          <p className="hero-stat-label">{people.length === 1 ? "Person" : "People"}</p>
        </div>
        {roleCounts.map((role) => (
          <div key={role.label}>
            <span className="hero-stat-value">{role.count}</span>
            <p className="hero-stat-label">{role.label}</p>
          </div>
        ))}
      </div>
    </div>

    <DirectoryList people={people.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      jobTitle: person.jobTitle,
      photoUrl: person.photoUrl,
      techStack: person.techStack,
      roleLabel: person.role.label,
      managerName: person.manager?.name ?? null,
    }))} />
  </div>;
}
