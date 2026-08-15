"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_LABELS, BILLING_MODELS, PROJECT_STATUSES } from "@/lib/delivery/validate";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Row = { id: string; code: string; name: string; client: string; status: string; billing: string; budget: string; manager: string; team: number; hours: string };
type Errors = Partial<Record<"name" | "code" | "clientId" | "status" | "billing" | "budgetAmount" | "defaultRate" | "startDate" | "endDate", string>>;

export function ProjectManager({ projects, clients, people, canManage }: {
  projects: ReadonlyArray<Row>;
  clients: ReadonlyArray<{ id: string; name: string; code: string }>;
  people: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const { query, setQuery, rows, isFiltered } = useFilter(projects, (project) => [project.name, project.code, project.client, project.status, project.manager]);
  const [open, setOpen] = useState(false);
  const empty = { name: "", code: "", clientId: clients[0]?.id ?? "", status: "PLANNED", billing: "TIME_AND_MATERIALS", budgetAmount: "", budgetCurrency: "INR", defaultRate: "", startDate: "", endDate: "", managerId: "", notes: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { message?: string; errors?: Errors };
      if (!response.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Created." });
      setForm(empty); setOpen(false); router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  const selectedClient = clients.find((client) => client.id === form.clientId);

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {canManage && <TableToolbar search={query} onSearch={setQuery} placeholder="Search projects…" label="Search projects">
      <>
        <button type="button" className="button button-primary" onClick={() => setOpen(true)} disabled={clients.length === 0}>Create a project</button>
        {clients.length === 0 && <span className="field-hint"> Add a client first.</span>}
      </>
    </TableToolbar>}

    {rows.length === 0
      ? <EmptyState message="No projects yet." filteredMessage="Nothing matches that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Billing</th><th scope="col">Budget</th><th scope="col">Manager</th><th scope="col">Team</th><th scope="col">Hours</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {rows.map((project) => <tr key={project.id}>
            <th scope="row"><strong>{project.name}</strong><span>{project.code}</span></th>
            <td>{project.client}</td>
            <td>{project.billing}</td>
            <td>{project.budget}</td>
            <td>{project.manager}</td>
            <td>{project.team}</td>
            <td>{project.hours}</td>
            <td><StatusChip status={project.status} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-title">
      <div className="dialog dialog--wide">
        <h3 id="project-title" className="dialog-title">Create a project</h3>
        <form className="contact-form" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="p-client">Client <em>*</em></label>
              <select id="p-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} aria-invalid={Boolean(errors.clientId)}>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              {errors.clientId && <p className="form-error">{errors.clientId}</p>}
            </div>
            <div>
              <label htmlFor="p-name">Project Name <em>*</em></label>
              <input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={Boolean(errors.name)} />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="p-code">Project Code <em>*</em></label>
              <input id="p-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors.code)} placeholder="WEB-01" />
              {errors.code ? <p className="form-error">{errors.code}</p>
                : <p className="field-hint">Becomes {selectedClient ? `${selectedClient.code}-${form.code || "…"}` : "…"}</p>}
            </div>
            <div>
              <label htmlFor="p-billing">Billing Model</label>
              <select id="p-billing" value={form.billing} onChange={(e) => setForm({ ...form, billing: e.target.value })}>
                {BILLING_MODELS.map((model) => <option key={model} value={model}>{BILLING_LABELS[model]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <div>
                <label htmlFor="p-currency">Currency</label>
                <select id="p-currency" value={form.budgetCurrency} onChange={(e) => setForm({ ...form, budgetCurrency: e.target.value })}>
                  {["INR", "USD", "GBP", "EUR", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p-budget">Budget</label>
                <input id="p-budget" inputMode="decimal" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })} aria-invalid={Boolean(errors.budgetAmount)} />
                {errors.budgetAmount && <p className="form-error">{errors.budgetAmount}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="p-rate">Default Hourly Rate</label>
              <input id="p-rate" inputMode="decimal" value={form.defaultRate} onChange={(e) => setForm({ ...form, defaultRate: e.target.value })} aria-invalid={Boolean(errors.defaultRate)} />
              {errors.defaultRate && <p className="form-error">{errors.defaultRate}</p>}
            </div>
            <div>
              <label htmlFor="p-start">Start Date</label>
              <input id="p-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} aria-invalid={Boolean(errors.startDate)} />
              {errors.startDate && <p className="form-error">{errors.startDate}</p>}
            </div>
            <div>
              <label htmlFor="p-end">End Date</label>
              <input id="p-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-invalid={Boolean(errors.endDate)} />
              {errors.endDate && <p className="form-error">{errors.endDate}</p>}
            </div>
            <div>
              <label htmlFor="p-manager">Project Manager</label>
              <select id="p-manager" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                <option value="">Unassigned</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
              <p className="field-hint">Assigned to the project automatically so they can book time.</p>
            </div>
            <div>
              <label htmlFor="p-status">Status</label>
              <select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status.toLowerCase().replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Creating…" : "Create Project"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
