"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; name: string; email: string; headline: string; location: string; skills: string; source: string; resumeUrl: string | null; hasConsent: boolean; applications: string[] };
type Errors = Record<string, string>;

export function CandidateManager({ candidates, canManage }: { candidates: ReadonlyArray<Row>; canManage: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const empty = { name: "", email: "", phone: "", headline: "", location: "", skills: "", source: "Direct", resumeUrl: "", linkedinUrl: "", noticePeriod: "", currentSalary: "", expectedSalary: "", notes: "", consent: false };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Client-side filter is fine at this scale; a server search comes with volume.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => [c.name, c.email, c.headline, c.skills, c.location].join(" ").toLowerCase().includes(q));
  }, [candidates, query]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null); setErrors({});
    try {
      const res = await fetch("/api/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await res.json() as { message?: string; errors?: Errors };
      if (!res.ok) { setErrors(result.errors ?? {}); setNotice({ tone: "error", text: result.message ?? "Unable to save." }); return; }
      setNotice({ tone: "success", text: result.message ?? "Added." });
      setForm(empty); setOpen(false); router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="action-bar">
      {canManage && <button type="button" className="button button-primary" onClick={() => setOpen(true)}>Add a candidate</button>}
      <input className="search-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, skills, or location" aria-label="Search candidates" />
    </div>

    {filtered.length === 0 ? <p className="portal-note">{query ? "No candidates match that search." : "No candidates yet."}</p> : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Candidate</th><th scope="col">Skills</th><th scope="col">Source</th><th scope="col">Pipelines</th><th scope="col">CV</th></tr></thead>
        <tbody>
          {filtered.map((c) => <tr key={c.id}>
            <th scope="row">
              <strong>{c.name}</strong>
              <span>{c.headline || c.email}{c.location && ` · ${c.location}`}</span>
              {!c.hasConsent && <span className="portal-muted">No consent recorded</span>}
            </th>
            <td>{c.skills || "—"}</td>
            <td>{c.source}</td>
            <td>{c.applications.length === 0 ? "—" : c.applications.join(", ")}</td>
            <td>{c.resumeUrl ? <a className="text-link" href={c.resumeUrl} target="_blank" rel="noreferrer noopener">Open</a> : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="cand-title">
      <div className="dialog dialog--wide">
        <h3 id="cand-title" className="dialog-title">Add a candidate</h3>
        <form className="contact-form" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label htmlFor="cd-name">Name <em>*</em></label><input id="cd-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={Boolean(errors.name)} />{errors.name && <p className="form-error">{errors.name}</p>}</div>
            <div><label htmlFor="cd-email">Email <em>*</em></label><input id="cd-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={Boolean(errors.email)} />{errors.email && <p className="form-error">{errors.email}</p>}</div>
            <div><label htmlFor="cd-phone">Phone</label><input id="cd-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label htmlFor="cd-location">Location</label><input id="cd-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="sm:col-span-2"><label htmlFor="cd-headline">Headline</label><input id="cd-headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Senior Backend Engineer, 8 years" /></div>
            <div className="sm:col-span-2"><label htmlFor="cd-skills">Skills</label><input id="cd-skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Java, Spring Boot, Postgres" /></div>
            <div>
              <label htmlFor="cd-cv">CV Link</label>
              <input id="cd-cv" type="url" value={form.resumeUrl} onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })} aria-invalid={Boolean(errors.resumeUrl)} placeholder="https://" />
              {errors.resumeUrl ? <p className="form-error">{errors.resumeUrl}</p> : <p className="field-hint">A link — nothing is uploaded or stored here.</p>}
            </div>
            <div><label htmlFor="cd-li">LinkedIn</label><input id="cd-li" type="url" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} aria-invalid={Boolean(errors.linkedinUrl)} placeholder="https://" />{errors.linkedinUrl && <p className="form-error">{errors.linkedinUrl}</p>}</div>
            <div><label htmlFor="cd-source">Source</label><input id="cd-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
            <div><label htmlFor="cd-notice">Notice Period</label><input id="cd-notice" value={form.noticePeriod} onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                <span>This candidate has agreed to us holding their details</span>
              </label>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Add Candidate"}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
