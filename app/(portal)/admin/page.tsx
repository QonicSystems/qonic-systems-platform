import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "People" };

export default async function AdminPeoplePage() {
  await requirePermission("user.view");

  const users = await db.user.findMany({ include: { role: true }, orderBy: [{ role: { rank: "asc" } }, { name: "asc" }] });

  return <section className="portal-section">
    <h2 className="portal-section-title">People</h2>
    <p className="portal-note">{users.length} account{users.length === 1 ? "" : "s"} in the workspace.</p>

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last signed in</th></tr></thead>
        <tbody>
          {users.map((user) => <tr key={user.id}>
            <th scope="row"><strong>{user.name}</strong><span>{user.email}</span></th>
            <td>{user.role.label}</td>
            <td><span className={`status-chip status-chip--${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span></td>
            <td>{user.lastLoginAt ? user.lastLoginAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
