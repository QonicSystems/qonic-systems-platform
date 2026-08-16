"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";
import { calculateTechMatch, extractTechTokens } from "@/lib/ats/match";
import {
  RESOURCE_TYPE_CLASS,
  RESOURCE_TYPE_LABEL,
  RESOURCE_TYPE_TABS,
  type ResourceType,
} from "@/lib/ats/resource-type";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  headline: string;
  location: string;
  techStack: string;
  visaType: string;
  visaStatus?: string;
  commissionPaid?: string;
  ssn?: string;
  benchStatus: string;
  source: string;
  resourceType: ResourceType;
  status: "ACTIVE" | "ARCHIVED";
  resumeUrl: string | null;
  hasConsent: boolean;
  applications: string[];
};
type Errors = Record<string, string>;

export function CandidateManager({
  candidates,
  canManage,
  canDraftContract,
}: {
  candidates: ReadonlyArray<Row>;
  canManage: boolean;
  canDraftContract: boolean;
}) {
  const router = useRouter();
  const [matchRequirement, setMatchRequirement] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  const [typeFilter, setTypeFilter] = useState<ResourceType | "ALL">("ALL");

  // Each tab counts against the *other* filter's selection, so the numbers
  // describe what clicking it would actually show.
  const byType = useMemo(
    () => (typeFilter === "ALL" ? candidates : candidates.filter((c) => c.resourceType === typeFilter)),
    [candidates, typeFilter]
  );
  const byStatus = useMemo(
    () => (statusFilter === "ALL" ? candidates : candidates.filter((c) => c.status === statusFilter)),
    [candidates, statusFilter]
  );
  const statusCounts = {
    ACTIVE: byType.filter((c) => c.status === "ACTIVE").length,
    ARCHIVED: byType.filter((c) => c.status === "ARCHIVED").length,
    ALL: byType.length,
  };
  const visible = useMemo(
    () => byType.filter((c) => statusFilter === "ALL" || c.status === statusFilter),
    [byType, statusFilter]
  );

  const { query, setQuery, rows, isFiltered } = useFilter(visible, (c) => [
    c.name,
    c.email,
    c.headline,
    c.techStack,
    c.location,
    c.visaType,
    c.benchStatus,
    c.source,
    RESOURCE_TYPE_LABEL[c.resourceType],
  ]);

  // Scored once per keystroke rather than once per cell, and used to rank the
  // table: with a requirement typed, the best fits belong at the top.
  const requirement = matchRequirement.trim();
  const matchTokens = useMemo(() => extractTechTokens(requirement), [requirement]);
  const scored = useMemo(() => {
    if (!requirement) return rows.map((row) => ({ row, match: null }));
    return rows
      .map((row) => ({ row, match: calculateTechMatch(row.techStack, requirement) }))
      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  }, [rows, requirement]);
  const strongMatches = scored.filter((entry) => (entry.match?.score ?? 0) >= 70).length;

  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const empty = {
    name: "",
    email: "",
    phone: "",
    headline: "",
    location: "",
    techStack: "",
    visaType: "",
    visaStatus: "",
    ssn: "",
    commissionPaid: "",
    address: "",
    benchStatus: "Direct",
    source: "Direct / LinkedIn",
    resumeUrl: "",
    linkedinUrl: "",
    noticePeriod: "",
    currentSalary: "",
    expectedSalary: "",
    notes: "",
    consent: false,
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const handleSourceChange = (newSource: string) => {
    const isGlobal = newSource === "Global Visa Resource";
    setForm((prev) => ({
      ...prev,
      source: newSource,
      visaType: isGlobal ? (prev.visaType || "H-1B") : "",
      visaStatus: isGlobal ? (prev.visaStatus || "Valid") : "",
      benchStatus: isGlobal ? (prev.benchStatus === "Direct" ? "Available / On Bench" : prev.benchStatus) : "Direct",
      ssn: isGlobal ? prev.ssn : "",
      commissionPaid: isGlobal ? prev.commissionPaid : "",
      address: isGlobal ? prev.address : "",
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const isGlobal = form.source === "Global Visa Resource";
      const payload = {
        ...form,
        skills: form.techStack,
        visaType: isGlobal ? form.visaType : null,
        visaStatus: isGlobal ? form.visaStatus : null,
        ssn: isGlobal ? form.ssn : null,
        commissionPaid: isGlobal ? form.commissionPaid : null,
        benchStatus: isGlobal ? form.benchStatus : "Direct",
      };

      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { message?: string; errors?: Errors };
      if (!res.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to save candidate." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Candidate added to pool." });
      setForm(empty);
      setOpen(false);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusy(false);
    }
  };

  /** Shared by archive/restore and delete: one place that reports failures. */
  const act = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that request." });
        // A 404/409 means the row on screen is stale; reload so the next attempt
        // is made against what is actually there.
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

  const toggleStatus = (candidate: Row) =>
    act(`/api/admin/candidates/${candidate.id}/status`, {
      method: "POST",
      body: JSON.stringify({ active: candidate.status !== "ACTIVE" }),
    });

  const remove = async (candidate: Row) => {
    if (await act(`/api/admin/candidates/${candidate.id}`, { method: "DELETE" })) setDeleting(null);
  };

  return (
    <div>
      {notice && (
        <p className={`form-status form-status--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

      {/* ── Status & resource-type filters ─────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-group" role="group" aria-label="Filter by status">
          <span className="filter-group__label">Status</span>
          {(["ACTIVE", "ARCHIVED", "ALL"] as const).map((key) => (
            <FilterChip
              key={key}
              label={key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()}
              count={statusCounts[key]}
              selected={statusFilter === key}
              onClick={() => setStatusFilter(key)}
            />
          ))}
        </div>
        <span className="filter-bar__divider" aria-hidden="true" />
        <div className="filter-group" role="group" aria-label="Filter by resource type">
          <span className="filter-group__label">Type</span>
          {RESOURCE_TYPE_TABS.map((tab) => (
            <FilterChip
              key={tab.key}
              label={tab.label}
              count={tab.key === "ALL" ? byStatus.length : byStatus.filter((c) => c.resourceType === tab.key).length}
              selected={typeFilter === tab.key}
              onClick={() => setTypeFilter(tab.key)}
            />
          ))}
        </div>
      </div>

      <TableToolbar
        search={query}
        onSearch={setQuery}
        placeholder="Search candidate, tech stack, visa, bench status…"
        label="Search candidate pool"
      >
        {canManage && (
          <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
            Add Candidate
          </button>
        )}
      </TableToolbar>

      {/* ── AI tech match ──────────────────────────────────────────────── */}
      <div className="ai-match" data-active={requirement ? "true" : "false"}>
        <div className="ai-match__field">
          <span className="ai-match__spark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />
            </svg>
          </span>
          <div className="ai-match__body">
            <label className="ai-match__label" htmlFor="ai-match-input">
              AI Tech Match
            </label>
            <input
              id="ai-match-input"
              type="text"
              value={matchRequirement}
              onChange={(e) => setMatchRequirement(e.target.value)}
              placeholder="Type the skills a role needs — e.g. React, AWS, Node — to score every candidate instantly"
              className="ai-match__input"
              autoComplete="off"
            />
          </div>
          {requirement && (
            <button
              type="button"
              className="ai-match__clear"
              onClick={() => setMatchRequirement("")}
              aria-label="Clear tech match"
            >
              Clear
            </button>
          )}
        </div>

        {requirement ? (
          <div className="ai-match__result">
            <span className="ai-match__summary">
              <strong>{strongMatches}</strong> of {scored.length} scored 70%+ · ranked best-fit first
            </span>
            <span className="ai-match__tokens">
              {matchTokens.map((token) => (
                <span key={token} className="ai-match__token">
                  {token}
                </span>
              ))}
            </span>
          </div>
        ) : (
          <p className="ai-match__hint">
            Matching runs in the browser across the {visible.length} candidate
            {visible.length === 1 ? "" : "s"} shown — no search button, no waiting.
          </p>
        )}
      </div>

      {scored.length === 0 ? (
        <EmptyState
          message={
            statusFilter === "ARCHIVED"
              ? "No archived candidates."
              : "No candidates in the pool yet."
          }
          filteredMessage="No candidates match that search."
          isFiltered={isFiltered || typeFilter !== "ALL" || statusFilter !== "ACTIVE"}
        />
      ) : (
        <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Resource Type</th>
                <th scope="col">Tech Stack &amp; Compatibility</th>
                <th scope="col">Visa &amp; Commission</th>
                <th scope="col">Bench / Utilization</th>
                <th scope="col">Active Pipelines</th>
                <th scope="col">CV</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(({ row: c, match }) => (
                <tr key={c.id} className={c.status === "ARCHIVED" ? "opacity-70" : undefined}>
                  <th scope="row">
                    <strong>{c.name}</strong>
                    <span>
                      {c.email} {c.location && `· ${c.location}`}
                    </span>
                    {c.ssn && c.ssn !== "—" && (
                      <span className="text-xs text-slate-500 font-mono">SSN: {c.ssn}</span>
                    )}
                    {!c.hasConsent && <span className="portal-muted">No consent recorded</span>}
                  </th>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${RESOURCE_TYPE_CLASS[c.resourceType]}`}
                        title={c.source || "Direct"}
                      >
                        {RESOURCE_TYPE_LABEL[c.resourceType]}
                      </span>
                      <StatusChip status={c.status} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-900">{c.techStack || "—"}</span>
                      {match && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              match.score >= 70
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : match.score >= 40
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-100 text-slate-600 border border-slate-300"
                            }`}
                          >
                            ⚡ {match.score}% Match
                          </span>
                          {match.matchedSkills.length > 0 && (
                            <span className="text-[10px] text-emerald-700">
                              ({match.matchedSkills.join(", ")})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      {c.resourceType === "GLOBAL" && c.visaType ? (
                        <>
                          <span className="text-xs font-semibold text-slate-800">
                            {c.visaType} {c.visaStatus ? `(${c.visaStatus})` : ""}
                          </span>
                          {c.commissionPaid && c.commissionPaid !== "—" && (
                            <span className="text-xs text-emerald-700 font-medium">
                              Comm: {c.commissionPaid}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium italic">Non-Visa / Direct</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      c.resourceType === "GLOBAL"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}>
                      {c.resourceType === "GLOBAL" ? c.benchStatus : "Direct"}
                    </span>
                  </td>
                  <td>{c.applications.length === 0 ? "—" : c.applications.join(", ")}</td>
                  <td>
                    {c.resumeUrl ? (
                      <a className="text-link" href={c.resumeUrl} target="_blank" rel="noreferrer noopener">
                        View CV
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="row-actions flex flex-wrap gap-1">
                      {canDraftContract && c.status === "ACTIVE" && (
                        <Link
                          href={`/contracts/new?candidateId=${c.id}&name=${encodeURIComponent(c.name)}&email=${encodeURIComponent(c.email)}`}
                          className="row-action row-action--highlight"
                          title="Draft employment contract for candidate"
                        >
                          {c.resourceType === "GLOBAL" ? "Issue Agreement" : "Draft Contract"}
                        </Link>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => toggleStatus(c)}
                          disabled={busy}
                          title={
                            c.status === "ACTIVE"
                              ? "Archive — keeps the record and its history"
                              : "Return this candidate to the active pool"
                          }
                        >
                          {c.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                      {canManage && (
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
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="cand-del-title">
          <div className="dialog">
            <h3 id="cand-del-title" className="dialog-title">
              Delete {deleting.name} permanently?
            </h3>
            <p className="portal-note">
              This erases the candidate record — visa details, commission history and CV link —
              along with {deleting.applications.length} pipeline application
              {deleting.applications.length === 1 ? "" : "s"}. It cannot be undone.
            </p>
            <p className="portal-note">
              To take them out of the pool while keeping the record and their name, use{" "}
              <strong>Deactivate</strong> instead.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => remove(deleting)}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="cand-title">
          <div className="dialog dialog--wide">
            <h3 id="cand-title" className="dialog-title">
              Add Candidate to Pool
            </h3>
            <form className="contact-form" noValidate onSubmit={submit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="cd-source">Resource Classification <em>*</em></label>
                  <select
                    id="cd-source"
                    value={form.source}
                    onChange={(e) => handleSourceChange(e.target.value)}
                  >
                    <option value="Global Visa Resource">Global Visa Resource (VISA Utilisation & Placement Commission)</option>
                    <option value="Direct / LinkedIn">Employee Dev (Sourced via LinkedIn)</option>
                    <option value="Internal Connection">Employee Dev (Sourced via Internal Network / Founders)</option>
                    <option value="Job Application">Direct Applicant</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cd-name">Full Name <em>*</em></label>
                  <input
                    id="cd-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={Boolean(errors.name)}
                    required
                  />
                  {errors.name && <p className="form-error">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="cd-email">Work / Contact Email <em>*</em></label>
                  <input
                    id="cd-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    aria-invalid={Boolean(errors.email)}
                    required
                  />
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>
                <div>
                  <label htmlFor="cd-phone">Phone</label>
                  <input
                    id="cd-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="cd-location">Location</label>
                  <input
                    id="cd-location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Dallas, TX / Remote"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="cd-techStack">Tech Stack & Skills <em>*</em></label>
                  <input
                    id="cd-techStack"
                    value={form.techStack}
                    onChange={(e) => setForm({ ...form, techStack: e.target.value })}
                    placeholder="React, TypeScript, Node.js, Python, AWS, PostgreSQL"
                    required
                  />
                </div>

                {/* Conditional Fields: Global Visa Resource */}
                {form.source === "Global Visa Resource" ? (
                  <>
                    <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                        Global Visa & Placement Commission Details
                      </p>
                    </div>
                    <div>
                      <label htmlFor="cd-visa">Visa Type <em>*</em></label>
                      <select
                        id="cd-visa"
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
                      <label htmlFor="cd-bench">Bench Status</label>
                      <select
                        id="cd-bench"
                        value={form.benchStatus}
                        onChange={(e) => setForm({ ...form, benchStatus: e.target.value })}
                      >
                        <option value="Available / On Bench">Available / On Bench</option>
                        <option value="Allocated to Project">Allocated to Project</option>
                        <option value="Interviewing">Interviewing</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cd-ssn">SSN / National ID</label>
                      <input
                        id="cd-ssn"
                        value={form.ssn}
                        onChange={(e) => setForm({ ...form, ssn: e.target.value })}
                        placeholder="123-45-6789"
                      />
                    </div>
                    <div>
                      <label htmlFor="cd-comm">Commission Paid on VISA ($ / ₹)</label>
                      <input
                        id="cd-comm"
                        type="number"
                        value={form.commissionPaid}
                        onChange={(e) => setForm({ ...form, commissionPaid: e.target.value })}
                        placeholder="e.g. 5000"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="cd-address">Residential / Postal Address</label>
                      <input
                        id="cd-address"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        placeholder="Street, City, State, ZIP"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        Developer Sourcing & Compensation Details
                      </p>
                    </div>
                    <div>
                      <label htmlFor="cd-notice">Notice Period</label>
                      <input
                        id="cd-notice"
                        value={form.noticePeriod}
                        onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })}
                        placeholder="Immediate / 15 Days / 1 Month"
                      />
                    </div>
                    <div>
                      <label htmlFor="cd-exp-salary">Expected Compensation</label>
                      <input
                        id="cd-exp-salary"
                        value={form.expectedSalary}
                        onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })}
                        placeholder="e.g. 80000 or $50/hr"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="cd-cv">CV / Resume Link</label>
                  <input
                    id="cd-cv"
                    type="url"
                    value={form.resumeUrl}
                    onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label htmlFor="cd-li">LinkedIn Profile URL</label>
                  <input
                    id="cd-li"
                    type="url"
                    value={form.linkedinUrl}
                    onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                    placeholder="https://"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={form.consent}
                      onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                    />
                    <span>This candidate has agreed to us holding their details</span>
                  </label>
                </div>
              </div>
              <div className="dialog-actions mt-5">
                <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? "Saving…" : "Add to Candidate Pool"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** The pill used by both filter groups above the table. */
function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        selected
          ? "bg-[#111111] text-white shadow-sm"
          : "bg-[#f8f7f3] text-[#4f4f4f] hover:bg-[#eeece4] border border-[#e7e4da]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
          selected ? "bg-[#ffd700] text-[#111111] font-bold" : "bg-black/10 text-[#6b6b6b]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
