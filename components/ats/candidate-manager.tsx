"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

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
  const { query, setQuery, rows, isFiltered } = useFilter(candidates, (c) => [
    c.name,
    c.email,
    c.headline,
    c.techStack,
    c.location,
    c.visaType,
    c.benchStatus,
    c.source,
  ]);

  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    email: "",
    phone: "",
    headline: "",
    location: "",
    techStack: "",
    visaType: "H-1B",
    visaStatus: "Valid",
    ssn: "",
    commissionPaid: "",
    address: "",
    benchStatus: "Available / On Bench",
    source: "Global Visa Resource",
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, skills: form.techStack }),
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

  return (
    <div>
      {notice && (
        <p className={`form-status form-status--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

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

      {rows.length === 0 ? (
        <EmptyState
          message="No candidates in the pool yet."
          filteredMessage="No candidates match that search."
          isFiltered={isFiltered}
        />
      ) : (
        <div className="matrix-scroll">
          <table className="matrix matrix--people">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Resource Type</th>
                <th scope="col">Tech Stack</th>
                <th scope="col">Visa & Commission</th>
                <th scope="col">Bench / Utilization</th>
                <th scope="col">Active Pipelines</th>
                <th scope="col">CV</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
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
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      {c.source || "Direct"}
                    </span>
                  </td>
                  <td>
                    <span className="font-semibold text-slate-900">{c.techStack || "—"}</span>
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-slate-800">
                        {c.visaType || "—"} {c.visaStatus ? `(${c.visaStatus})` : ""}
                      </span>
                      {c.commissionPaid && c.commissionPaid !== "—" && (
                        <span className="text-xs text-emerald-700 font-medium">
                          Comm: {c.commissionPaid}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {c.benchStatus}
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
                    <div className="row-actions">
                      {canDraftContract && (
                        <Link
                          href="/contracts/new"
                          className="row-action row-action--highlight"
                          title="Draft employment contract for candidate"
                        >
                          Draft Contract
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
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
