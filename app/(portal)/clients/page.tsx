import { ClientManager } from "@/components/delivery/client-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const context = await requirePermission("client.view");

  const [clients, owners] = await Promise.all([
    // Jobs and invoices are counted too: they decide whether a client can be
    // deleted, so the confirm dialog can say what is blocking it up front.
    db.client.findMany({
      include: { owner: { select: { name: true } }, _count: { select: { projects: true, jobs: true, invoices: true } } },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
      }))}
      owners={owners}
      canManage={can(context, "client.manage")}
    />
  </div>;
}
