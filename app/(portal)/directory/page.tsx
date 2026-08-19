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

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Team</p>
      <h1 className="portal-title">Directory</h1>
      <p className="portal-lead">Everyone currently active in the workspace — {people.length} {people.length === 1 ? "person" : "people"}.</p>
    </header>

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
