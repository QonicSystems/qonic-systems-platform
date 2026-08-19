"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BILLING_LABELS,
  BILLING_MODELS,
  PROJECT_ARCHIVED_STATUS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
} from "@/lib/delivery/validate";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type Assignment = {
  userId: string;
  allocationPercent: number;
  name: string;
  email: string;
  roleLabel: string;
  jobTitle: string;
};

export type Milestone = {
  id: string;
  name: string;
  dueDate: string;
  status: string;
  amount: string;
};

export type ProjectTask = {
  id: string;
  name: string;
  billable: boolean;
  isActive: boolean;
  entries: number;
};

export type EmployeeOption = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  jobTitle: string;
};

type Row = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  client: string;
  status: string;
  billing: string;
  rawBilling?: string;
  budget: string;
  budgetAmount?: string;
  budgetCurrency?: string;
  defaultRate?: string;
  startDate?: string;
  endDate?: string;
  managerId?: string;
  manager: string;
  notes?: string;
  team: number;
  assignments?: ReadonlyArray<Assignment>;
  hours: string;
  negotiationCompleted?: boolean;
  completedReason?: string;
  /** Drive the delete guard's warning without waiting for a 409. */
  timeEntryCount: number;
  invoiceCount: number;
  expenseCount: number;
  milestones?: ReadonlyArray<Milestone>;
  tasks?: ReadonlyArray<ProjectTask>;
};
type Errors = Partial<
  Record<
    | "name"
    | "code"
    | "clientId"
    | "status"
    | "billing"
    | "budgetAmount"
    | "defaultRate"
    | "startDate"
    | "endDate"
    | "completedReason",
    string
  >
>;

export function ProjectManager({
  projects,
  clients,
  people,
  allEmployees = [],
  canManage,
}: {
  projects: ReadonlyArray<Row>;
  clients: ReadonlyArray<{ id: string; name: string; code: string }>;
  people: ReadonlyArray<{ id: string; name: string }>;
  allEmployees?: ReadonlyArray<EmployeeOption>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "COMPLETED" | "CANCELLED" | "ALL">("ACTIVE");

  const counts = {
    ACTIVE: projects.filter((p) => p.status === "ACTIVE").length,
    COMPLETED: projects.filter((p) => p.status === "COMPLETED").length,
    CANCELLED: projects.filter((p) => p.status === PROJECT_ARCHIVED_STATUS).length,
    ALL: projects.length,
  };
  const visible = useMemo(
    () => (statusFilter === "ALL" ? projects : projects.filter((p) => p.status === statusFilter)),
    [projects, statusFilter]
  );

  const { query, setQuery, rows, isFiltered } = useFilter(visible, (project) => [
    project.name,
    project.code,
    project.client,
    project.status,
    project.manager,
  ]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [managingTeam, setManagingTeam] = useState<Row | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const empty = {
    name: "",
    code: "",
    clientId: clients[0]?.id ?? "",
    status: "ACTIVE",
    billing: "TIME_AND_MATERIALS",
    budgetAmount: "",
    budgetCurrency: "INR",
    defaultRate: "",
    startDate: "",
    endDate: "",
    managerId: people[0]?.id ?? "",
    notes: "",
    negotiationCompleted: false,
    completedReason: "",
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const startEdit = (project: Row) => {
    setEditing(project);
    const parts = project.code.split("-");
    const suffix = parts.length > 1 ? parts.slice(1).join("-") : project.code;
    setForm({
      name: project.name,
      code: suffix,
      clientId: project.clientId,
      status: project.status,
      billing: project.rawBilling || "TIME_AND_MATERIALS",
      budgetAmount: project.budgetAmount || "",
      budgetCurrency: project.budgetCurrency || "INR",
      defaultRate: project.defaultRate || "",
      startDate: project.startDate || "",
      endDate: project.endDate || "",
      managerId: project.managerId || (people[0]?.id ?? ""),
      notes: project.notes || "",
      negotiationCompleted: project.negotiationCompleted ?? false,
      completedReason: project.completedReason ?? "",
    });
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const startAdd = () => {
    setEditing(null);
    setForm(empty);
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const url = editing ? `/api/projects/${editing.id}` : "/api/projects";
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { message?: string; errors?: Errors };
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to save project." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? (editing ? "Project updated successfully." : "Project created successfully.") });
      setForm(empty);
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusy(false);
    }
  };

  /** Cancel / reinstate / delete — one place that surfaces the server's reason. */
  const act = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that request." });
        if (response.status === 404 || response.status === 409) router.refresh();
        return false;
      }
      setNotice({ tone: "success", text: result.message ?? "Updated." });
      router.refresh();
      return true;
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleCancelled = (project: Row) =>
    act(`/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: project.status === PROJECT_ARCHIVED_STATUS ? "ACTIVE" : PROJECT_ARCHIVED_STATUS }),
    });

  const remove = async (project: Row) => {
    if (await act(`/api/projects/${project.id}`, { method: "DELETE" })) setDeleting(null);
  };

  const planning = projects.find((p) => p.id === planningId) ?? null;
  const selectedClient = clients.find((client) => client.id === form.clientId);

  return (
    <div>
      {notice && (
        <p className={`form-status form-status--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}
      <div className="filter-bar" role="group" aria-label="Filter by status">
        <span className="filter-group__label">Status</span>
        {(["ACTIVE", "COMPLETED", "CANCELLED", "ALL"] as const).map((key) => {
          const selected = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selected ? "bg-[#111111] text-white shadow-sm" : "bg-[#f8f7f3] text-[#4f4f4f] hover:bg-[#eeece4] border border-[#e7e4da]"
              }`}
            >
              <span>{key === "ALL" ? "All" : PROJECT_STATUS_LABELS[key] ?? key}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
                selected ? "bg-[#ffd700] text-[#111111] font-bold" : "bg-black/10 text-[#6b6b6b]"
              }`}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {canManage && (
        <TableToolbar
          search={query}
          onSearch={setQuery}
          placeholder="Search projects, client, code, manager…"
          label="Search projects"
        >
          <>
            <button
              type="button"
              className="button button-primary"
              onClick={startAdd}
              disabled={clients.length === 0}
            >
              Create a project
            </button>
            {clients.length === 0 && <span className="field-hint"> Add a client first.</span>}
          </>
        </TableToolbar>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message={
            statusFilter === "CANCELLED"
              ? "No cancelled projects."
              : statusFilter === "COMPLETED"
              ? "No completed projects."
              : "No active projects yet."
          }
          filteredMessage="Nothing matches that search."
          isFiltered={isFiltered || statusFilter !== "ACTIVE"}
        />
      ) : (
        <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Client</th>
                <th scope="col">Billing</th>
                <th scope="col">Budget</th>
                <th scope="col">Project Manager</th>
                <th scope="col">Negotiation Completed</th>
                <th scope="col">Hours</th>
                <th scope="col">Status</th>
                {canManage && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => (
                <tr key={project.id} className={project.status === PROJECT_ARCHIVED_STATUS ? "opacity-70" : undefined}>
                  <th scope="row">
                    <strong>{project.name}</strong>
                    <span>{project.code}</span>
                  </th>
                  <td>{project.client}</td>
                  <td>{project.billing}</td>
                  <td>{project.budget}</td>
                  <td>{project.manager}</td>
                  <td>
                    {project.negotiationCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        ✓ Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        • Pending
                      </span>
                    )}
                  </td>
                  <td>{project.hours} hrs</td>
                  <td>
                    <StatusChip status={project.status} label={PROJECT_STATUS_LABELS[project.status]} />
                  </td>
                  {canManage && (
                    <td>
                      <div className="row-actions flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="row-action font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 hover:text-black border border-amber-200"
                          onClick={() => setManagingTeam(project)}
                          disabled={busy}
                          title="Allocate or manage team members on this project"
                        >
                          Team ({project.assignments?.length ?? project.team})
                        </button>
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => setPlanningId(project.id)}
                          disabled={busy}
                          title="Milestones and the tasks time can be booked to"
                        >
                          Plan ({(project.milestones?.length ?? 0) + (project.tasks?.length ?? 0)})
                        </button>
                        <button
                          type="button"
                          className="row-action font-semibold text-slate-800 hover:text-black"
                          onClick={() => startEdit(project)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => toggleCancelled(project)}
                          disabled={busy}
                          title={
                            project.status === PROJECT_ARCHIVED_STATUS
                              ? "Put this project back into delivery"
                              : "Cancel — keeps time, invoices and expenses on record"
                          }
                        >
                          {project.status === PROJECT_ARCHIVED_STATUS ? "Reinstate" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          className="row-action row-action--danger"
                          onClick={() => {
                            setDeleting(project);
                            setNotice(null);
                          }}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ProjectDeleteDialog
          project={deleting}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        />
      )}

      {open && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-title">
          <div className="dialog dialog--wide">
            <h3 id="project-title" className="dialog-title">
              {editing ? `Edit ${editing.name}` : "Create a project"}
            </h3>
            <form className="contact-form" noValidate onSubmit={submit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-client">
                    Client <em>*</em>
                  </label>
                  <select
                    id="p-client"
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                    aria-invalid={Boolean(errors.clientId)}
                  >
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  {errors.clientId && <p className="form-error">{errors.clientId}</p>}
                </div>
                <div>
                  <label htmlFor="p-name">
                    Project Name <em>*</em>
                  </label>
                  <input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={Boolean(errors.name)}
                    required
                  />
                  {errors.name && <p className="form-error">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="p-code">
                    Project Code <em>*</em>
                  </label>
                  <input
                    id="p-code"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    aria-invalid={Boolean(errors.code)}
                    placeholder="WEB-01"
                    required
                  />
                  {errors.code ? (
                    <p className="form-error">{errors.code}</p>
                  ) : (
                    <p className="field-hint">
                      Becomes {selectedClient ? `${selectedClient.code}-${form.code || "…"}` : "…"}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="p-billing">Billing Model</label>
                  <select
                    id="p-billing"
                    value={form.billing}
                    onChange={(e) => setForm({ ...form, billing: e.target.value })}
                  >
                    {BILLING_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {BILLING_LABELS[model]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[6rem_1fr] gap-3">
                  <div>
                    <label htmlFor="p-currency">Currency</label>
                    <select
                      id="p-currency"
                      value={form.budgetCurrency}
                      onChange={(e) => setForm({ ...form, budgetCurrency: e.target.value })}
                    >
                      {["INR", "USD", "GBP", "EUR", "AED"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="p-budget">Budget</label>
                    <input
                      id="p-budget"
                      inputMode="decimal"
                      value={form.budgetAmount}
                      onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })}
                      aria-invalid={Boolean(errors.budgetAmount)}
                    />
                    {errors.budgetAmount && <p className="form-error">{errors.budgetAmount}</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor="p-rate">Default Hourly Rate</label>
                  <input
                    id="p-rate"
                    inputMode="decimal"
                    value={form.defaultRate}
                    onChange={(e) => setForm({ ...form, defaultRate: e.target.value })}
                    aria-invalid={Boolean(errors.defaultRate)}
                  />
                  {errors.defaultRate && <p className="form-error">{errors.defaultRate}</p>}
                </div>
                <div>
                  <label htmlFor="p-start">Start Date</label>
                  <input
                    id="p-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    aria-invalid={Boolean(errors.startDate)}
                  />
                  {errors.startDate && <p className="form-error">{errors.startDate}</p>}
                </div>
                <div>
                  <label htmlFor="p-end">End Date</label>
                  <input
                    id="p-end"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    aria-invalid={Boolean(errors.endDate)}
                  />
                  {errors.endDate && <p className="form-error">{errors.endDate}</p>}
                </div>
                <div>
                  <label htmlFor="p-manager">Project Manager (Founder / Co-Founder)</label>
                  <select
                    id="p-manager"
                    value={form.managerId}
                    onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  >
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">Project management is restricted to leadership.</p>
                </div>
                <div>
                  <label htmlFor="p-status">Status</label>
                  <select
                    id="p-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status] ?? status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={form.negotiationCompleted}
                      onChange={(e) => setForm({ ...form, negotiationCompleted: e.target.checked })}
                    />
                    <span className="font-semibold text-slate-800">
                      Negotiation Completed with Client
                    </span>
                  </label>
                  <p className="field-hint">
                    Check if all commercial and delivery contract terms are agreed.
                  </p>
                </div>
                {form.status === "COMPLETED" && (
                  <div className="sm:col-span-2">
                    <label htmlFor="p-reason">
                      Completion Reason <em>*</em>
                    </label>
                    <textarea
                      id="p-reason"
                      rows={2}
                      value={form.completedReason}
                      onChange={(e) => setForm({ ...form, completedReason: e.target.value })}
                      aria-invalid={Boolean(errors.completedReason)}
                      placeholder="e.g. Successfully delivered all milestones and signed off by client."
                    />
                    {errors.completedReason && <p className="form-error">{errors.completedReason}</p>}
                  </div>
                )}
              </div>
              <div className="dialog-actions mt-5">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => {
                    setOpen(false);
                    setEditing(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? (editing ? "Updating…" : "Creating…") : (editing ? "Update Project" : "Create Project")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {planning && (
        <PlanDialog
          project={planning}
          busy={busy}
          canManage={canManage}
          onClose={() => setPlanningId(null)}
          onCall={act}
        />
      )}

      {managingTeam && (
        <TeamDialog
          project={managingTeam}
          allEmployees={allEmployees}
          busy={busy}
          onClose={() => setManagingTeam(null)}
          onAssign={async (userId, allocationPercent) => {
            setBusy(true);
            try {
              const res = await fetch(`/api/projects/${managingTeam.id}/team`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, allocationPercent }),
              });
              const data = (await res.json()) as { message?: string };
              if (res.ok) {
                router.refresh();
                const emp = allEmployees.find((e) => e.id === userId);
                if (emp) {
                  const updatedAssignments = [
                    ...(managingTeam.assignments?.filter((a) => a.userId !== userId) ?? []),
                    {
                      userId: emp.id,
                      name: emp.name,
                      email: emp.email,
                      roleLabel: emp.roleLabel,
                      jobTitle: emp.jobTitle,
                      allocationPercent,
                    },
                  ];
                  setManagingTeam({
                    ...managingTeam,
                    assignments: updatedAssignments,
                    team: updatedAssignments.length,
                  });
                }
                return { ok: true, message: data.message };
              }
              return { ok: false, message: data.message ?? "Could not assign team member." };
            } catch {
              return { ok: false, message: "Unable to connect to server." };
            } finally {
              setBusy(false);
            }
          }}
          onRemove={async (userId) => {
            setBusy(true);
            try {
              const res = await fetch(`/api/projects/${managingTeam.id}/team?userId=${encodeURIComponent(userId)}`, {
                method: "DELETE",
              });
              const data = (await res.json()) as { message?: string };
              if (res.ok) {
                router.refresh();
                const updatedAssignments = (managingTeam.assignments ?? []).filter((a) => a.userId !== userId);
                setManagingTeam({
                  ...managingTeam,
                  assignments: updatedAssignments,
                  team: updatedAssignments.length,
                });
                return { ok: true, message: data.message };
              }
              return { ok: false, message: data.message ?? "Could not remove team member." };
            } catch {
              return { ok: false, message: "Unable to connect to server." };
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

const MILESTONE_STATUSES = [
  { key: "PENDING", label: "Pending" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "MISSED", label: "Missed" },
];

/**
 * The delivery plan for one project: the milestones it bills against, and the
 * tasks people can book time to.
 *
 * Both existed in the schema and in the API and had no screen. Milestones were
 * invisible entirely; tasks could only ever be the single "General" row created
 * with the project, which meant the per-task billable flag the invoice builder
 * reads could never be varied.
 */
function PlanDialog({ project, busy, canManage, onClose, onCall }: {
  project: Row;
  busy: boolean;
  canManage: boolean;
  onClose: () => void;
  onCall: (url: string, init: RequestInit) => Promise<boolean>;
}) {
  const [milestone, setMilestone] = useState({ name: "", dueDate: "", amount: "" });
  const [task, setTask] = useState({ name: "", billable: true });
  const nonBillable = project.rawBilling === "NON_BILLABLE";

  const milestones = project.milestones ?? [];
  const tasks = project.tasks ?? [];

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className="dialog dialog--wide">
        <h3 id="plan-title" className="dialog-title">Plan — {project.name}</h3>
        <p className="portal-note">{project.client} · {project.billing}</p>

        {/* ── Milestones ───────────────────────────────────────────────── */}
        <section className="panel-block">
          <div className="panel-block__head">
            <h4>Milestones</h4>
            {project.rawBilling === "FIXED_PRICE" && (
              <span className="pill pill--warn">Fixed price bills on these</span>
            )}
          </div>

          {milestones.length === 0
            ? <p className="portal-muted">No milestones yet.</p>
            : <ul className="timeline timeline--tight">
                {milestones.map((m) => <li key={m.id} className="timeline__item">
                  <div className="timeline__head">
                    <strong>{m.name}</strong>
                    <StatusChip status={m.status} />
                    {m.amount !== "—" && <span className="timeline__amount">{m.amount}</span>}
                  </div>
                  <p className="timeline__meta">Due {m.dueDate}</p>
                  {canManage && <div className="row-actions flex flex-wrap gap-1">
                    {MILESTONE_STATUSES.filter((o) => o.key !== m.status).map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() => onCall(`/api/projects/${project.id}/milestones`, {
                          method: "PATCH",
                          body: JSON.stringify({ milestoneId: m.id, status: o.key }),
                        })}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>}
                </li>)}
              </ul>}

          {canManage && <div className="contact-form panel-form mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label htmlFor="ms-name">Milestone <em>*</em></label>
                <input id="ms-name" value={milestone.name} onChange={(e) => setMilestone({ ...milestone, name: e.target.value })} placeholder="Phase 1 sign-off" />
              </div>
              <div>
                <label htmlFor="ms-due">Due date <em>*</em></label>
                <input id="ms-due" type="date" value={milestone.dueDate} onChange={(e) => setMilestone({ ...milestone, dueDate: e.target.value })} />
              </div>
              <div>
                <label htmlFor="ms-amt">Amount</label>
                <input id="ms-amt" inputMode="decimal" value={milestone.amount} onChange={(e) => setMilestone({ ...milestone, amount: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={busy || milestone.name.trim().length < 2 || !milestone.dueDate}
                onClick={async () => {
                  const ok = await onCall(`/api/projects/${project.id}/milestones`, { method: "POST", body: JSON.stringify(milestone) });
                  if (ok) setMilestone({ name: "", dueDate: "", amount: "" });
                }}
              >
                {busy ? "Adding…" : "Add milestone"}
              </button>
            </div>
          </div>}
        </section>

        {/* ── Tasks ────────────────────────────────────────────────────── */}
        <section className="panel-block">
          <div className="panel-block__head">
            <h4>Tasks time can be booked to</h4>
          </div>

          {tasks.length === 0
            ? <p className="portal-muted">No tasks yet.</p>
            : <ul className="timeline timeline--tight">
                {tasks.map((t) => <li key={t.id} className="timeline__item">
                  <div className="timeline__head">
                    <strong>{t.name}</strong>
                    <span className={`pill${t.billable ? " pill--warn" : ""}`}>{t.billable ? "Billable" : "Non-billable"}</span>
                    {!t.isActive && <StatusChip status="ARCHIVED" />}
                  </div>
                  <p className="timeline__meta">
                    {t.entries === 0 ? "No time booked" : `${t.entries} time ${t.entries === 1 ? "entry" : "entries"}`}
                  </p>
                  {canManage && <div className="row-actions flex flex-wrap gap-1">
                    {!nonBillable && (
                      <button
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() => onCall(`/api/projects/${project.id}/tasks`, {
                          method: "PATCH",
                          body: JSON.stringify({ taskId: t.id, billable: !t.billable }),
                        })}
                      >
                        Make {t.billable ? "non-billable" : "billable"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="row-action"
                      disabled={busy}
                      onClick={() => onCall(`/api/projects/${project.id}/tasks`, {
                        method: "PATCH",
                        body: JSON.stringify({ taskId: t.id, isActive: !t.isActive }),
                      })}
                    >
                      {t.isActive ? "Retire" : "Reinstate"}
                    </button>
                    {t.entries === 0 && (
                      <button
                        type="button"
                        className="row-action row-action--danger"
                        disabled={busy}
                        onClick={() => onCall(`/api/projects/${project.id}/tasks?taskId=${encodeURIComponent(t.id)}`, { method: "DELETE" })}
                      >
                        Delete
                      </button>
                    )}
                  </div>}
                </li>)}
              </ul>}

          {canManage && <div className="contact-form panel-form mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tk-name">Task <em>*</em></label>
                <input id="tk-name" value={task.name} onChange={(e) => setTask({ ...task, name: e.target.value })} placeholder="Discovery, QA, Support…" />
              </div>
              <div>
                <label className="inline-check mt-6">
                  <input
                    type="checkbox"
                    checked={task.billable && !nonBillable}
                    disabled={nonBillable}
                    onChange={(e) => setTask({ ...task, billable: e.target.checked })}
                  />
                  <span>Billable</span>
                </label>
                {nonBillable && <p className="field-hint">This project is non-billable, so its tasks are too.</p>}
              </div>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={busy || task.name.trim().length < 2}
                onClick={async () => {
                  const ok = await onCall(`/api/projects/${project.id}/tasks`, {
                    method: "POST",
                    body: JSON.stringify({ name: task.name, billable: task.billable && !nonBillable }),
                  });
                  if (ok) setTask({ name: "", billable: !nonBillable });
                }}
              >
                {busy ? "Adding…" : "Add task"}
              </button>
            </div>
          </div>}
        </section>

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Team and Resource Allocation Dialog
 * Allows Founders/Managers to assign developers to projects with allocation %
 * and remove unneeded allocations.
 */
function TeamDialog({
  project,
  allEmployees,
  busy,
  onClose,
  onAssign,
  onRemove,
}: {
  project: Row;
  allEmployees: ReadonlyArray<EmployeeOption>;
  busy: boolean;
  onClose: () => void;
  onAssign: (userId: string, allocationPercent: number) => Promise<{ ok: boolean; message?: string }>;
  onRemove: (userId: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [selectedUserId, setSelectedUserId] = useState(
    allEmployees.find((e) => !project.assignments?.some((a) => a.userId === e.id))?.id ?? allEmployees[0]?.id ?? ""
  );
  const [allocation, setAllocation] = useState("100");
  const [localNotice, setLocalNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const availableEmployees = allEmployees.filter(
    (e) => !project.assignments?.some((a) => a.userId === e.id)
  );

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setLocalNotice(null);
    const res = await onAssign(selectedUserId, Number(allocation) || 100);
    if (res.ok) {
      setLocalNotice({ tone: "success", text: res.message ?? "Resource allocated successfully." });
    } else {
      setLocalNotice({ tone: "error", text: res.message ?? "Failed to assign resource." });
    }
  };

  const handleRemove = async (userId: string) => {
    setLocalNotice(null);
    const res = await onRemove(userId);
    if (res.ok) {
      setLocalNotice({ tone: "success", text: res.message ?? "Removed from project." });
    } else {
      setLocalNotice({ tone: "error", text: res.message ?? "Failed to remove resource." });
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="team-dialog-title">
      <div className="dialog dialog--wide">
        <div className="flex items-center justify-between pb-3 border-b border-[#e7e4da]">
          <div>
            <h3 id="team-dialog-title" className="dialog-title text-lg font-bold text-[#111111]">
              Team & Resource Allocation — {project.name}
            </h3>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Code: <span className="font-mono font-semibold">{project.code}</span> · Client: <strong>{project.client}</strong>
            </p>
          </div>
          <button type="button" className="text-gray-400 hover:text-black font-bold p-1 text-lg" onClick={onClose}>
            ✕
          </button>
        </div>

        {localNotice && (
          <p className={`form-status form-status--${localNotice.tone} mt-3 mb-0`} role="status">
            {localNotice.text}
          </p>
        )}

        {/* Current Team Roster */}
        <div className="mt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#4f4f4f] mb-2">
            Currently Assigned Resources ({project.assignments?.length ?? 0})
          </h4>
          {!project.assignments || project.assignments.length === 0 ? (
            <p className="text-xs text-[#8c8a82] italic bg-[#faf9f5] border border-[#e7e4da] p-3 rounded-lg">
              No developers or staff are currently assigned to this project. Use the form below to allocate team members.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {project.assignments.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between p-3 bg-[#fbfbfa] border border-[#e7e4da] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#111111] text-[#ffd700] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#111111]">{member.name}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 font-medium text-[#4f4f4f]">
                          {member.roleLabel}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {member.allocationPercent}% Allocated
                        </span>
                      </div>
                      <p className="text-xs text-[#6b6b6b] mt-0.5">
                        {member.email} {member.jobTitle ? `· ${member.jobTitle}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded border border-rose-200 transition-colors"
                    onClick={() => handleRemove(member.userId)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Allocate New Resource Form */}
        <div className="mt-5 pt-4 border-t border-[#e7e4da]">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#4f4f4f] mb-2">
            Assign Developer / Team Member
          </h4>
          {availableEmployees.length === 0 ? (
            <p className="text-xs text-[#8c8a82]">All active staff members are already assigned to this project.</p>
          ) : (
            <form onSubmit={handleAssign} className="grid sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-7">
                <label htmlFor="assign-user" className="text-xs font-semibold text-[#4f4f4f] block mb-1">
                  Select Employee / Developer <em>*</em>
                </label>
                <select
                  id="assign-user"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 border border-[#e7e4da] rounded-md bg-white"
                  required
                >
                  <option value="" disabled>Choose a person…</option>
                  {availableEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.roleLabel}) — {emp.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="assign-alloc" className="text-xs font-semibold text-[#4f4f4f] block mb-1">
                  Allocation (%)
                </label>
                <input
                  id="assign-alloc"
                  type="number"
                  min="1"
                  max="100"
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value)}
                  className="w-full text-xs text-center font-bold py-2 border border-[#e7e4da] rounded-md"
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className="button button-primary w-full text-xs py-2"
                  disabled={busy || !selectedUserId}
                >
                  {busy ? "Assigning…" : "+ Assign Resource"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="dialog-actions mt-6 pt-3 border-t border-[#e7e4da]">
          <button type="button" className="button button-outline text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Names what blocks the delete before it is attempted. Time entries, invoices
 * and expenses are the three that matter: the first would be refused by the
 * database, and the other two would silently lose their project reference.
 */
function ProjectDeleteDialog({ project, busy, onCancel, onConfirm }: {
  project: Row;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blockers = [
    project.timeEntryCount > 0
      ? `${project.timeEntryCount} time ${project.timeEntryCount === 1 ? "entry" : "entries"}`
      : null,
    project.invoiceCount > 0 ? `${project.invoiceCount} invoice${project.invoiceCount === 1 ? "" : "s"}` : null,
    project.expenseCount > 0 ? `${project.expenseCount} expense${project.expenseCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-del-title">
      <div className="dialog">
        <h3 id="project-del-title" className="dialog-title">Delete {project.name}?</h3>
        {blockers.length > 0 ? (
          <>
            <p className="portal-note">
              <strong>{project.name}</strong> has {blockers.join(", ")} booked against it, so it cannot be
              deleted — that is billable and financial history.
            </p>
            <p className="portal-note">
              Use <strong>Cancel</strong> instead. It takes the project out of delivery and keeps every record attached to it.
            </p>
          </>
        ) : (
          <p className="portal-note">
            This permanently removes <strong>{project.name}</strong> along with its team assignments,
            tasks and milestones. No time, invoices or expenses are attached, so no financial history
            is lost. It cannot be undone.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="button button-danger"
            onClick={onConfirm}
            disabled={busy || blockers.length > 0}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
