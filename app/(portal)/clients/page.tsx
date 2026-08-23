import { ClientManager } from "@/components/delivery/client-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { leadershipRoleWhere } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const context = await requirePermission("client.view");

  const [clients, leadershipOwners] = await Promise.all([
    // Jobs and invoices are counted too: they decide whether a client can be
    // deleted, so the confirm dialog can say what is blocking it up front.
    db.client.findMany({
      include: {
        owner: { select: { name: true } },
        // Primary first, then alphabetical — the contact list had no reader at all.
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        _count: { select: { projects: true, jobs: true, invoices: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Account Owner is restricted to leadership. Matched on rank, not on a list
    // of role keys, so a role the CEO creates at rank 10 or better is eligible
    // without a code change — with the seeded ranks this is the same set.
    db.user.findMany({
      where: {
        status: "ACTIVE",
        role: leadershipRoleWhere,
      },
      select: { id: true, name: true, role: { select: { label: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">Delivery</p>
      <h1 className="portal-title">Clients</h1>
      <p className="portal-lead">{clients.length} client{clients.length === 1 ? "" : "s"} on the books.</p>
    </header>

    <ClientManager
      clients={clients.map((client) => ({
        id: client.id, name: client.name, code: client.code, status: client.status,
        industry: client.industry ?? "", website: client.website ?? "", notes: client.notes ?? "",
        ownerId: client.ownerId ?? "", owner: client.owner?.name ?? "—",
        projectCount: client._count.projects,
        jobCount: client._count.jobs,
        invoiceCount: client._count.invoices,
        contacts: client.contacts.map((c) => ({
          id: c.id, name: c.name, email: c.email ?? "", phone: c.phone ?? "",
          title: c.title ?? "", isPrimary: c.isPrimary,
        })),
      }))}
      owners={leadershipOwners.map((p) => ({
        id: p.id,
        name: `${p.name} (${p.role.label})`,
      }))}
      canManage={can(context, "client.manage")}
    />
  </div>;
}
