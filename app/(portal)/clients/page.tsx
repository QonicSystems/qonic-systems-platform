import { ClientManager } from "@/components/delivery/client-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const context = await requirePermission("client.view");

  const [clients, owners] = await Promise.all([
    db.client.findMany({ include: { owner: { select: { name: true } }, _count: { select: { projects: true } } }, orderBy: { name: "asc" } }),
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
        industry: client.industry ?? "", owner: client.owner?.name ?? "—", projectCount: client._count.projects,
      }))}
      owners={owners}
      canManage={can(context, "client.manage")}
    />
  </div>;
}
