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
import { TechStackBadges } from "@/components/ats/tech-stack-badges";

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
  visaExpiry?: string;
  commissionPaid?: string;
  rawCommissionPaid?: string;
  ssn?: string;
  rawSsn?: string;
  address?: string;
  benchStatus: string;
  projectAllocations?: ReadonlyArray<{ projectName: string; projectCode: string; allocationPercent: number }>;
  source: string;
  resourceType: ResourceType;
  noticePeriod?: string;
  expectedSalary?: string;
  currentSalary?: string;
  notes?: string;
  status: "ACTIVE" | "ARCHIVED";
  resumeUrl: string | null;
  linkedinUrl?: string;
  hasConsent: boolean;
  applications: string[];
  linkedUserName: string | null;
  contractStatus: string | null;
  contractId: string | null;
};
type Errors = Record<string, string>;

/** The `source` value each Add button seeds the dialog with. */
const GLOBAL_SOURCE = "Global Visa Resource";
const EMPLOYEE_DEV_SOURCE = "Direct / LinkedIn";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  headline: "",
  location: "",
  techStack: "",
  visaType: "",
  visaStatus: "",
  visaExpiry: "",
  ssn: "",
  commissionPaid: "",
  address: "",
  benchStatus: "Available / Ready to Deploy",
  source: EMPLOYEE_DEV_SOURCE,
  resumeUrl: "",
  linkedinUrl: "",
  noticePeriod: "",
  currentSalary: "",
  expectedSalary: "",
  notes: "",
  consent: false,
};
type CandidateForm = typeof EMPTY_FORM;

/**
 * Applies the defaults that go with a resource classification.
 *
 * Pure and module-scope so the two Add buttons and the in-dialog classification
 * select run the identical logic — when this lived inline in the change handler
 * only the select could reach it, and a button that seeded `source` directly
 * would have left the visa and bench fields on their non-global defaults.
 */
function withSourceDefaults(previous: CandidateForm, source: string): CandidateForm {
  const isGlobal = source === GLOBAL_SOURCE;
  return {
    ...previous,
    source,
    visaType: isGlobal ? previous.visaType || "H-1B" : "",
    visaStatus: isGlobal ? previous.visaStatus || "Valid" : "",
    visaExpiry: isGlobal ? previous.visaExpiry : "",
    benchStatus: isGlobal
      ? previous.benchStatus.includes("Bench")
        ? previous.benchStatus
        : "Available / On Bench"
      : "Available / Ready to Deploy",
    ssn: isGlobal ? previous.ssn : "",
    commissionPaid: isGlobal ? previous.commissionPaid : "",
    address: isGlobal ? previous.address : "",
  };
}

export function CandidateManager({
  candidates,
  canManage,
  canDraftContract,
  canCreateAccount,
}: {
  candidates: ReadonlyArray<Row>;
  canManage: boolean;
  canDraftContract: boolean;
  /** `user.manage` — creating a staff account is account administration. */
  canCreateAccount: boolean;
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
    c.phone,
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
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [form, setForm] = useState<CandidateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Only ever set when SMTP is unconfigured and the invite could not be emailed.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const startEdit = (c: Row) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone || "",
      headline: c.headline || "",
      location: c.location || "",
      techStack: c.techStack || "",
      visaType: c.visaType || "",
      visaStatus: c.visaStatus || "",
      visaExpiry: c.visaExpiry || "",
      ssn: c.rawSsn || "",
      commissionPaid: c.rawCommissionPaid || "",
      address: c.address || "",
      benchStatus: c.benchStatus || "Available / Ready to Deploy",
      source: c.source || EMPLOYEE_DEV_SOURCE,
      resumeUrl: c.resumeUrl || "",
      linkedinUrl: c.linkedinUrl || "",
      noticePeriod: c.noticePeriod || "",
      currentSalary: c.currentSalary || "",
      expectedSalary: c.expectedSalary || "",
      notes: c.notes || "",
      consent: c.hasConsent,
    });
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const startAdd = (source: string) => {
    setEditing(null);
    setForm(withSourceDefaults(EMPTY_FORM, source));
    setErrors({});
    setNotice(null);
    setOpen(true);
  };

  const handleSourceChange = (newSource: string) => {
    setForm((prev) => withSourceDefaults(prev, newSource));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const isGlobal = form.source === GLOBAL_SOURCE;
      const payload = {
        ...form,
        skills: form.techStack,
        visaType: isGlobal ? form.visaType : null,
        visaStatus: isGlobal ? form.visaStatus : null,
        visaExpiry: isGlobal ? form.visaExpiry || null : null,
        ssn: isGlobal ? form.ssn : null,
        commissionPaid: isGlobal ? form.commissionPaid : null,
        benchStatus: form.benchStatus || (isGlobal ? "Available / On Bench" : "Available / Ready to Deploy"),
      };

      const url = editing ? `/api/candidates/${editing.id}` : "/api/candidates";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { message?: string; errors?: Errors };
      if (!res.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to save candidate." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? (editing ? "Candidate updated successfully." : "Candidate added to pool.") });
      setForm(EMPTY_FORM);
      setOpen(false);
      setEditing(null);
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
    act(`/api/candidates/${candidate.id}/status`, {
      method: "POST",
      body: JSON.stringify({ active: candidate.status !== "ACTIVE" }),
    });

  const remove = async (candidate: Row) => {
    if (await act(`/api/candidates/${candidate.id}`, { method: "DELETE" })) setDeleting(null);
  };

  /**
   * Gives the candidate a staff account and records the link.
   *
   * Not folded into `act`: this is the one call that can return an invite link,
   * and that link has to survive the `router.refresh()` so it can be copied.
   */
  const createAccount = async (candidate: Row) => {
    setBusy(true);
    setNotice(null);
    setInviteUrl(null);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/employee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await res.json().catch(() => ({}))) as { message?: string; inviteUrl?: string };
      if (!res.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to create that account." });
        if (res.status === 404 || res.status === 409) router.refresh();
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Account created." });
      setInviteUrl(result.inviteUrl ?? null);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {notice && (
        <p className={`form-status form-status--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

      {inviteUrl && (
        <div className="portal-panel mt-4 mb-6">
          <p className="font-semibold text-emerald-800">New invite link generated:</p>
          <p className="portal-note">Email is not configured in this environment. Send this link directly to the person:</p>
          <p className="mfa-secret">{inviteUrl}</p>
        </div>
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
        {/* Both kinds of candidate are added here now — Global Candidates used
            to be a separate Administration tab with its own form and its own
            API, which is how it drifted into writing no `source` at all. */}
        {canManage && (
          <>
            <button type="button" className="button button-outline" onClick={() => startAdd(EMPLOYEE_DEV_SOURCE)}>
              Add Developer
            </button>
            <button type="button" className="button button-primary" onClick={() => startAdd(GLOBAL_SOURCE)}>
              Add Global Candidate
            </button>
          </>
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
              placeholder="e.g. React, TypeScript, Python, AWS…"
              autoComplete="off"
              spellCheck="false"
              className="ai-match__input"
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
        <>
          {/* ── Section 1: Developer & Direct Talent Pool ─────────────────── */}
          {(typeFilter === "ALL" || typeFilter === "DIRECT" || typeFilter === "EMPLOYEE_DEV") && (
            <section className="mb-6">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-3 h-3 rounded-full bg-blue-600 shadow-xs" />
                <h2 className="text-lg font-extrabold text-[#111111] tracking-tight m-0">
                  Developer &amp; Direct Talent Pool
                </h2>
                <span className="bg-[#eef2ff] text-[#1e40af] border border-[#c7d2fe] text-xs font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                  {scored.filter((entry) => entry.row.resourceType !== "GLOBAL").length} Developers
                </span>
              </div>

              {scored.filter((entry) => entry.row.resourceType !== "GLOBAL").length === 0 ? (
                <div className="portal-panel p-6 text-center text-sm text-slate-500">
                  No direct employee developers found matching the current search.
                </div>
              ) : (
                <div className="matrix-scroll">
                  <table className="matrix matrix--people">
                    <thead>
                      <tr>
                        <th scope="col">Candidate</th>
                        <th scope="col">Classification</th>
                        <th scope="col">Tech Stack &amp; Compatibility</th>
                        <th scope="col">Compensation &amp; Notice</th>
                        <th scope="col">Deployment Availability</th>
                        <th scope="col">Active Pipelines</th>
                        <th scope="col">CV</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scored
                        .filter((entry) => entry.row.resourceType !== "GLOBAL")
                        .map(({ row: c, match }) => (
                          <tr key={c.id} className={c.status === "ARCHIVED" ? "opacity-70" : undefined}>
                            <th scope="row">
                              <strong>{c.name}</strong>
                              <span>
                                {c.email} {c.location && `· ${c.location}`}
                              </span>
                              {!c.hasConsent && <span className="portal-muted">No consent recorded</span>}
                              {c.linkedUserName && <span className="portal-muted">Linked employee: {c.linkedUserName}</span>}
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
                              <div className="flex flex-col gap-1.5 min-w-[200px]">
                                <TechStackBadges stack={c.techStack} />
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
                                      <span className="text-[10px] text-emerald-700 font-medium">
                                        ({match.matchedSkills.join(", ")})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-slate-800">
                                  Direct Staff (Non-Visa)
                                </span>
                                {c.expectedSalary && (
                                  <span className="text-xs text-slate-600">
                                    Exp: ₹{c.expectedSalary}
                                  </span>
                                )}
                                {c.noticePeriod && (
                                  <span className="text-[11px] text-blue-700 font-medium">
                                    Notice: {c.noticePeriod}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {c.projectAllocations && c.projectAllocations.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {c.projectAllocations.map((p) => (
                                    <span
                                      key={p.projectName}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <span>Tagged: {p.projectName} ({p.allocationPercent}%)</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border bg-amber-50 text-amber-900 border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  <span>Available / Ready to Deploy</span>
                                </span>
                              )}
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
                                {canManage && (
                                  <button
                                    type="button"
                                    className="row-action font-semibold text-slate-800 hover:text-black"
                                    onClick={() => startEdit(c)}
                                    disabled={busy}
                                  >
                                    Edit
                                  </button>
                                )}
                                {c.contractStatus && c.contractId && (
                                  <Link href={`/contracts/${c.contractId}`} className="row-action" title="View this candidate's contract letter">
                                    <StatusChip status={c.contractStatus} />
                                  </Link>
                                )}
                                {/* An account first, then a letter addressed to
                                    it. Creating the account used to happen
                                    invisibly when this link was followed —
                                    during a GET render — so it fired on
                                    prefetch and on every refresh too. */}
                                {canCreateAccount && c.status === "ACTIVE" && !c.linkedUserName && (
                                  <button
                                    type="button"
                                    className="row-action row-action--highlight"
                                    onClick={() => createAccount(c)}
                                    disabled={busy}
                                    title="Create their staff account and send a one-time invite"
                                  >
                                    Create Employee Account
                                  </button>
                                )}
                                {canDraftContract && c.status === "ACTIVE" && !c.contractStatus && c.linkedUserName && (
                                  <Link
                                    href={`/contracts/new?candidateId=${c.id}`}
                                    className="row-action row-action--highlight"
                                    title="Draft employment contract for candidate"
                                  >
                                    Draft Contract
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
            </section>
          )}

          {/* ── Separator Divider (Visible on All tab) ─────────────────────── */}
          {typeFilter === "ALL" && (
            <div className="relative my-10 py-2" aria-hidden="true">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-dashed border-slate-300 dark:border-neutral-700" />
              </div>
              <div className="relative flex justify-center">
                <div className="inline-flex items-center gap-2.5 bg-[#111111] text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg border border-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Global Visa Resources (H-1B, L-1 &amp; US Bench)</span>
                  <span className="bg-[#ffd700] text-[#111111] text-[11px] px-2 py-0.5 rounded-full font-extrabold">
                    {scored.filter((entry) => entry.row.resourceType === "GLOBAL").length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 2: Global Visa Resources Pool ─────────────────────── */}
          {(typeFilter === "ALL" || typeFilter === "GLOBAL") && (
            <section className="mt-4">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-3 h-3 rounded-full bg-emerald-600 shadow-xs" />
                <h2 className="text-lg font-extrabold text-[#111111] tracking-tight m-0">
                  Global Visa Resources Pool
                </h2>
                <span className="bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] text-xs font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                  {scored.filter((entry) => entry.row.resourceType === "GLOBAL").length} Visa Resources
                </span>
              </div>

              {scored.filter((entry) => entry.row.resourceType === "GLOBAL").length === 0 ? (
                <div className="portal-panel p-6 text-center text-sm text-slate-500">
                  No global visa candidates found matching the current search.
                </div>
              ) : (
                <div className="matrix-scroll">
                  <table className="matrix matrix--people">
                    <thead>
                      <tr>
                        <th scope="col">Candidate</th>
                        <th scope="col">Visa Classification</th>
                        <th scope="col">Tech Stack &amp; Compatibility</th>
                        <th scope="col">Visa Type &amp; Commission</th>
                        <th scope="col">Bench Utilization</th>
                        <th scope="col">Active Pipelines</th>
                        <th scope="col">CV</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scored
                        .filter((entry) => entry.row.resourceType === "GLOBAL")
                        .map(({ row: c, match }) => (
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
                              {c.linkedUserName && <span className="portal-muted">Linked employee: {c.linkedUserName}</span>}
                            </th>
                            <td>
                              <div className="flex flex-col items-start gap-1">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${RESOURCE_TYPE_CLASS[c.resourceType]}`}
                                  title={c.source || "Global"}
                                >
                                  {RESOURCE_TYPE_LABEL[c.resourceType]}
                                </span>
                                <StatusChip status={c.status} />
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-col gap-1.5 min-w-[200px]">
                                <TechStackBadges stack={c.techStack} />
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
                                      <span className="text-[10px] text-emerald-700 font-medium">
                                        ({match.matchedSkills.join(", ")})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-slate-800">
                                  {c.visaType || "Visa Required"} {c.visaStatus ? `(${c.visaStatus})` : ""}
                                </span>
                                {c.visaExpiry && (
                                  <span className="text-[11px] text-slate-500">Expires {c.visaExpiry}</span>
                                )}
                                {c.commissionPaid && c.commissionPaid !== "—" && (
                                  <span className="text-xs text-emerald-700 font-medium">
                                    Comm: {c.commissionPaid}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {c.projectAllocations && c.projectAllocations.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {c.projectAllocations.map((p) => (
                                    <span
                                      key={p.projectName}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <span>Tagged: {p.projectName} ({p.allocationPercent}%)</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>{c.benchStatus || "Available / On Bench"}</span>
                                </span>
                              )}
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
                                {canManage && (
                                  <button
                                    type="button"
                                    className="row-action font-semibold text-slate-800 hover:text-black"
                                    onClick={() => startEdit(c)}
                                    disabled={busy}
                                  >
                                    Edit
                                  </button>
                                )}
                                {c.contractStatus && c.contractId && (
                                  <Link href={`/contracts/${c.contractId}`} className="row-action" title="View this candidate's contract letter">
                                    <StatusChip status={c.contractStatus} />
                                  </Link>
                                )}
                                {/* An account first, then a letter addressed to
                                    it. Creating the account used to happen
                                    invisibly when this link was followed —
                                    during a GET render — so it fired on
                                    prefetch and on every refresh too. */}
                                {canCreateAccount && c.status === "ACTIVE" && !c.linkedUserName && (
                                  <button
                                    type="button"
                                    className="row-action row-action--highlight"
                                    onClick={() => createAccount(c)}
                                    disabled={busy}
                                    title="Create their staff account and send a one-time invite"
                                  >
                                    Create Employee Account
                                  </button>
                                )}
                                {canDraftContract && c.status === "ACTIVE" && !c.contractStatus && c.linkedUserName && (
                                  <Link
                                    href={`/contracts/new?candidateId=${c.id}`}
                                    className="row-action row-action--highlight"
                                    title="Issue client / placement agreement for candidate"
                                  >
                                    Issue Agreement
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
            </section>
          )}
        </>
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
              {editing
                ? `Edit Candidate: ${editing.name}`
                : form.source === GLOBAL_SOURCE
                  ? "Add Global Candidate"
                  : "Add Developer"}
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
                    <option value="Direct / LinkedIn">Developer (Sourced via LinkedIn)</option>
                    <option value="Internal Connection">Developer (Sourced via Internal Network / Founders)</option>
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
                      <label htmlFor="cd-visa-status">Visa Status</label>
                      <input
                        id="cd-visa-status"
                        value={form.visaStatus}
                        onChange={(e) => setForm({ ...form, visaStatus: e.target.value })}
                        placeholder="Active, Transfer in Progress, Extension Filed"
                      />
                    </div>
                    <div>
                      <label htmlFor="cd-visa-expiry">Visa Expiry</label>
                      <input
                        id="cd-visa-expiry"
                        type="date"
                        value={form.visaExpiry}
                        onChange={(e) => setForm({ ...form, visaExpiry: e.target.value })}
                      />
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
                        <option value="Placement Closed">Placement Closed</option>
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
                    <div className="sm:col-span-2">
                      <label htmlFor="cd-bench-non-global">Bench &amp; Deployment Availability</label>
                      <select
                        id="cd-bench-non-global"
                        value={form.benchStatus}
                        onChange={(e) => setForm({ ...form, benchStatus: e.target.value })}
                      >
                        <option value="Available / Ready to Deploy">Available / Ready to Deploy</option>
                        <option value="Allocated to Client Project">Allocated to Client Project</option>
                        <option value="Interviewing / In Pipeline">Interviewing / In Pipeline</option>
                        <option value="On Notice Period">On Notice Period</option>
                      </select>
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
                  {busy
                    ? editing ? "Updating…" : "Saving…"
                    : editing
                      ? "Update Candidate"
                      : form.source === GLOBAL_SOURCE
                        ? "Add Global Candidate"
                        : "Add Developer"}
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
