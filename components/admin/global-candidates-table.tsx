"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";
import { formatMoney } from "@/lib/money";
import { RESOURCE_TYPE_CLASS, RESOURCE_TYPE_LABEL, type ResourceType } from "@/lib/ats/resource-type";

export type GlobalCandidateRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  ssn: string;
  visaType: string;
  visaStatus: string;
  visaExpiry: string | null;
  address: string;
  location: string;
  commissionPaid: number;
  techStack: string;
  benchStatus: string;
  resourceType: ResourceType;
  status: "ACTIVE" | "ARCHIVED";
  canEdit: boolean;
};

type Errors = Record<string, string>;

export function GlobalCandidatesTable({
  candidates,
  canManage,
}: {
  candidates: ReadonlyArray<GlobalCandidateRow>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  const statusCounts = {
    ACTIVE: candidates.filter((c) => c.status === "ACTIVE").length,
    ARCHIVED: candidates.filter((c) => c.status === "ARCHIVED").length,
    ALL: candidates.length,
  };
  const visible = useMemo(
    () => (statusFilter === "ALL" ? candidates : candidates.filter((c) => c.status === statusFilter)),
    [candidates, statusFilter]
  );

  const { query, setQuery, rows, isFiltered } = useFilter(visible, (c) => [
    c.name,
    c.email,
    c.phone,
    c.visaType,
    c.location,
    c.techStack,
    c.benchStatus,
    RESOURCE_TYPE_LABEL[c.resourceType],
  ]);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GlobalCandidateRow | null>(null);
  const [deleting, setDeleting] = useState<GlobalCandidateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const emptyForm = {
    name: "",
    email: "",
    phone: "",
    ssn: "",
    visaType: "H-1B",
    visaStatus: "Active",
    visaExpiry: "",
    address: "",
    location: "",
    commissionPaid: "",
    techStack: "",
    benchStatus: "Available / On Bench",
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});

  const saveCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});

    try {
      const url = editing ? `/api/admin/candidates/${editing.id}` : "/api/admin/candidates";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await res.json()) as { message?: string; errors?: Errors };
      if (!res.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to save." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Candidate profile saved." });
      setAdding(false);
      setEditing(null);
      setForm(emptyForm);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusy(false);
    }
  };

  /** Status changes and deletes: one place that surfaces the server's message. */
  const act = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that request." });
        if (res.status === 404 || res.status === 409) router.refresh();
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

  const toggleStatus = (c: GlobalCandidateRow) =>
    act(`/api/admin/candidates/${c.id}/status`, {
      method: "POST",
      body: JSON.stringify({ active: c.status !== "ACTIVE" }),
    });

  const remove = async (c: GlobalCandidateRow) => {
    if (await act(`/api/admin/candidates/${c.id}`, { method: "DELETE" })) setDeleting(null);
  };

  const startEdit = (c: GlobalCandidateRow) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone,
      ssn: c.ssn,
      visaType: c.visaType || "H-1B",
      visaStatus: c.visaStatus || "Active",
      visaExpiry: c.visaExpiry || "",
      address: c.address,
      location: c.location,
      commissionPaid: c.commissionPaid ? (c.commissionPaid / 100).toString() : "",
      techStack: c.techStack,
      benchStatus: c.benchStatus || "Available / On Bench",
    });
    setAdding(true);
  };

  return (
    <div>
      {notice && (
        <p className={`form-status form-status--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

      <div className="filter-bar" role="group" aria-label="Filter by status">
        <span className="filter-group__label">Status</span>
        {(["ACTIVE", "ARCHIVED", "ALL"] as const).map((key) => {
          const selected = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selected
                  ? "bg-[#111111] text-white shadow-sm"
                  : "bg-[#f8f7f3] text-[#4f4f4f] hover:bg-[#eeece4] border border-[#e7e4da]"
              }`}
            >
              <span>{key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
                  selected ? "bg-[#ffd700] text-[#111111] font-bold" : "bg-black/10 text-[#6b6b6b]"
                }`}
              >
                {statusCounts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <TableToolbar search={query} onSearch={setQuery} placeholder="Search candidate, tech stack, visa, location…" label="Search global candidates">
        {canManage && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setAdding(true);
            }}
          >
            Add Global Candidate
          </button>
        )}
      </TableToolbar>

      {rows.length === 0 ? (
        <EmptyState
          message={statusFilter === "ARCHIVED" ? "No archived candidates." : "No global candidates recorded yet."}
          filteredMessage="No candidates match that search."
          isFiltered={isFiltered || statusFilter !== "ACTIVE"}
        />
      ) : (
        <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead>
              <tr>
                <th scope="col">Candidate Name</th>
                <th scope="col">Tech Stack</th>
                <th scope="col">Visa Details</th>
                <th scope="col">SSN (Masked)</th>
                <th scope="col">Location / Address</th>
                <th scope="col">Commission Paid</th>
                <th scope="col">Bench Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.status === "ARCHIVED" ? "opacity-70" : undefined}>
                  <th scope="row">
                    <strong>{c.name}</strong>
                    <span>{c.email} {c.phone && `· ${c.phone}`}</span>
                    <span className="matrix-tags">
                      <span
                        className={`items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${RESOURCE_TYPE_CLASS[c.resourceType]}`}
                      >
                        {RESOURCE_TYPE_LABEL[c.resourceType]}
                      </span>
                      <StatusChip status={c.status} />
                    </span>
                  </th>
                  <td>
                    <span className="font-semibold text-slate-900">{c.techStack || "—"}</span>
                  </td>
                  <td>
                    <div className="text-xs">
                      <span className="font-bold text-slate-800">{c.visaType || "—"}</span>
                      {c.visaStatus && <span className="text-slate-500"> ({c.visaStatus})</span>}
                      {c.visaExpiry && <p className="text-[11px] text-slate-500">Exp: {c.visaExpiry}</p>}
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {c.ssn ? `•••-••-${c.ssn.slice(-4)}` : "—"}
                    </span>
                  </td>
                  <td>
                    <span>{c.location || "—"}</span>
                    {c.address && <p className="text-[11px] text-slate-500 truncate max-w-xs">{c.address}</p>}
                  </td>
                  <td>
                    {c.commissionPaid > 0 ? (
                      <span className="font-semibold text-emerald-700">
                        {formatMoney(c.commissionPaid, "USD")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {c.benchStatus}
                    </span>
                  </td>
                  <td>
                    {c.canEdit && (
                      <div className="row-actions flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => startEdit(c)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => toggleStatus(c)}
                          disabled={busy}
                          title={
                            c.status === "ACTIVE"
                              ? "Archive — keeps the record, name and history"
                              : "Return this candidate to the active pool"
                          }
                        >
                          {c.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          type="button"
                          className="row-action row-action--danger"
                          onClick={() => {
                            setDeleting(c);
                            setNotice(null);
                          }}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="gc-del-title">
          <div className="dialog">
            <h3 id="gc-del-title" className="dialog-title">
              Delete {deleting.name} permanently?
            </h3>
            <p className="portal-note">
              This removes the full talent record — visa details, SSN, commission history — and any
              pipeline applications attached to it. It cannot be undone.
            </p>
            <p className="portal-note">
              To take them out of the active pool while keeping the record and their name, use{" "}
              <strong>Deactivate</strong> instead.
            </p>
            <div className="dialog-actions">
              <button type="button" className="button button-outline" onClick={() => setDeleting(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button button-danger" onClick={() => remove(deleting)} disabled={busy}>
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="gc-title">
          <div className="dialog dialog--wide">
            <h3 id="gc-title" className="dialog-title">
              {editing ? `Edit ${editing.name}` : "Add Global Candidate"}
            </h3>
            <form className="contact-form" noValidate onSubmit={saveCandidate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="gc-name">Full Name <em>*</em></label>
                  <input
                    id="gc-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={Boolean(errors.name)}
                    required
                  />
                  {errors.name && <p className="form-error">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="gc-email">Work Email <em>*</em></label>
                  <input
                    id="gc-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    aria-invalid={Boolean(errors.email)}
                    required
                  />
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>
                <div>
                  <label htmlFor="gc-phone">Phone Number</label>
                  <input
                    id="gc-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="gc-ssn">SSN Number (4 digits or full)</label>
                  <input
                    id="gc-ssn"
                    value={form.ssn}
                    onChange={(e) => setForm({ ...form, ssn: e.target.value })}
                    placeholder="1234 or 123-45-6789"
                  />
                </div>
                <div>
                  <label htmlFor="gc-visaType">Visa Type</label>
                  <select
                    id="gc-visaType"
                    value={form.visaType}
                    onChange={(e) => setForm({ ...form, visaType: e.target.value })}
                  >
                    <option value="H-1B">H-1B</option>
                    <option value="OPT / CPT">OPT / CPT</option>
                    <option value="L-1">L-1</option>
                    <option value="TN">TN</option>
                    <option value="Green Card">Green Card / Permanent Resident</option>
                    <option value="Citizen">US Citizen / National</option>
                    <option value="UK Skilled Worker">UK Skilled Worker</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="gc-visaStatus">Visa Status</label>
                  <input
                    id="gc-visaStatus"
                    value={form.visaStatus}
                    onChange={(e) => setForm({ ...form, visaStatus: e.target.value })}
                    placeholder="Active, Transfer in Progress, Extension Filed"
                  />
                </div>
                <div>
                  <label htmlFor="gc-visaExpiry">Visa Expiry Date</label>
                  <input
                    id="gc-visaExpiry"
                    type="date"
                    value={form.visaExpiry}
                    onChange={(e) => setForm({ ...form, visaExpiry: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="gc-commission">Commission Paid on VISA ($)</label>
                  <input
                    id="gc-commission"
                    inputMode="decimal"
                    value={form.commissionPaid}
                    onChange={(e) => setForm({ ...form, commissionPaid: e.target.value })}
                    placeholder="e.g. 5000"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="gc-techStack">Tech Stack & Skills <em>*</em></label>
                  <input
                    id="gc-techStack"
                    value={form.techStack}
                    onChange={(e) => setForm({ ...form, techStack: e.target.value })}
                    placeholder="React, Node.js, Python, AWS, PostgreSQL, Java, Golang"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="gc-location">Current Location</label>
                  <input
                    id="gc-location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="City, State / Country"
                  />
                </div>
                <div>
                  <label htmlFor="gc-bench">Bench / Utilization Status</label>
                  <select
                    id="gc-bench"
                    value={form.benchStatus}
                    onChange={(e) => setForm({ ...form, benchStatus: e.target.value })}
                  >
                    <option value="Available / On Bench">Available / On Bench</option>
                    <option value="Allocated to Project">Allocated to Project</option>
                    <option value="Interviewing">Interviewing</option>
                    <option value="Placement Closed">Placement Closed</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="gc-address">Address Details</label>
                  <textarea
                    id="gc-address"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Full residential or mailing address"
                  />
                </div>
              </div>

              <div className="dialog-actions mt-5">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setAdding(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Update Candidate" : "Save Global Candidate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
