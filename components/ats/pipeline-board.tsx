"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = { key: string; label: string };
export type BoardApplication = {
  id: string; candidateName: string; candidateHeadline: string; resumeUrl: string | null;
  stage: string; interviews: number; lastScore: number | null; placed: boolean;
  outcomeReason: string | null; available: ReadonlyArray<Stage>;
};

export function PipelineBoard({ jobId, stages, applications, addableCandidates, canManage, canPlace }: {
  jobId: string;
  stages: ReadonlyArray<Stage>;
  applications: ReadonlyArray<BoardApplication>;
  addableCandidates: ReadonlyArray<{ id: string; label: string }>;
  canManage: boolean;
  canPlace: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [reasonFor, setReasonFor] = useState<{ app: BoardApplication; to: Stage } | null>(null);
  const [placing, setPlacing] = useState<BoardApplication | null>(null);
  const [note, setNote] = useState("");
  const [placement, setPlacement] = useState({ startDate: "", salary: "", feePercent: "12.5", guaranteeDays: "90" });

  const call = async (url: string, body: unknown, method = "POST") => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json() as { message?: string };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      if (res.ok) router.refresh();
      return res.ok;
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); return false; }
    finally { setBusy(false); }
  };

  const move = async (app: BoardApplication, to: Stage) => {
    // A rejection or withdrawal needs a reason, so ask before sending.
    if (to.key === "REJECTED" || to.key === "WITHDRAWN") { setReasonFor({ app, to }); return; }
    await call(`/api/applications/${app.id}/stage`, { to: to.key });
  };

  const live = applications.filter((a) => !["REJECTED", "WITHDRAWN"].includes(a.stage));
  const closed = applications.filter((a) => ["REJECTED", "WITHDRAWN"].includes(a.stage));

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {canManage && <p><button type="button" className="button button-primary" onClick={() => setAdding(true)} disabled={addableCandidates.length === 0}>Add a candidate</button>
      {addableCandidates.length === 0 && <span className="field-hint"> Everyone in the pool is already on this job.</span>}</p>}

    <div className="board">
      {stages.map((stage) => {
        const cards = live.filter((app) => app.stage === stage.key);
        return <section key={stage.key} className="board-column">
          <h2 className="board-heading">{stage.label} <span>{cards.length}</span></h2>
          {cards.length === 0 ? <p className="board-empty">—</p> : cards.map((app) => <article key={app.id} className="board-card">
            <strong>{app.candidateName}</strong>
            {app.candidateHeadline && <span className="board-sub">{app.candidateHeadline}</span>}
            <span className="board-meta">
              {app.interviews > 0 && `${app.interviews} interview${app.interviews === 1 ? "" : "s"}`}
              {app.lastScore !== null && ` · ${app.lastScore}/5`}
            </span>
            {app.resumeUrl && <a className="board-cv" href={app.resumeUrl} target="_blank" rel="noreferrer noopener">View CV</a>}
            {canManage && app.available.length > 0 && <div className="board-actions">
              {app.available.map((next) => <button key={next.key} type="button" className={`row-action ${next.key === "REJECTED" ? "row-action--danger" : ""}`}
                disabled={busy} onClick={() => move(app, next)}>{next.label}</button>)}
              {canPlace && !app.placed && app.stage === "OFFER" && <button type="button" className="row-action row-action--primary" disabled={busy} onClick={() => setPlacing(app)}>Record placement</button>}
            </div>}
          </article>)}
        </section>;
      })}
    </div>

    {closed.length > 0 && <section className="portal-section">
      <h2 className="portal-section-title">Closed</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead><tr><th scope="col">Candidate</th><th scope="col">Outcome</th><th scope="col">Reason</th></tr></thead>
          <tbody>
            {closed.map((app) => <tr key={app.id}>
              <th scope="row"><strong>{app.candidateName}</strong></th>
              <td><span className={`status-chip status-chip--${app.stage.toLowerCase()}`}>{app.stage.toLowerCase()}</span></td>
              <td>{app.outcomeReason ?? "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {adding && <Dialog title="Add a candidate to this job" onClose={() => setAdding(false)} busy={busy}
      onConfirm={async () => { if (await call("/api/applications", { jobId, candidateId })) { setAdding(false); setCandidateId(""); } }}
      confirmLabel="Add" disabled={!candidateId}>
      <label htmlFor="pick">Candidate</label>
      <select id="pick" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
        <option value="">Select someone from the talent pool</option>
        {addableCandidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    </Dialog>}

    {reasonFor && <Dialog title={`${reasonFor.to.label} — ${reasonFor.app.candidateName}`} onClose={() => { setReasonFor(null); setNote(""); }} busy={busy}
      onConfirm={async () => { if (await call(`/api/applications/${reasonFor.app.id}/stage`, { to: reasonFor.to.key, note })) { setReasonFor(null); setNote(""); } }}
      confirmLabel={reasonFor.to.label} disabled={note.trim().length < 3} danger>
      <label htmlFor="why">Reason</label>
      <textarea id="why" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded permanently against the application." />
    </Dialog>}

    {placing && <Dialog title={`Record placement — ${placing.candidateName}`} onClose={() => setPlacing(null)} busy={busy}
      onConfirm={async () => { if (await call(`/api/applications/${placing.id}/placement`, { ...placing && placement })) setPlacing(null); }}
      confirmLabel="Record placement" disabled={!placement.startDate || !placement.salary}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="pl-start">Start Date</label><input id="pl-start" type="date" value={placement.startDate} onChange={(e) => setPlacement({ ...placement, startDate: e.target.value })} /></div>
        <div><label htmlFor="pl-salary">Annual Salary</label><input id="pl-salary" inputMode="decimal" value={placement.salary} onChange={(e) => setPlacement({ ...placement, salary: e.target.value })} /></div>
        <div><label htmlFor="pl-fee">Fee %</label><input id="pl-fee" inputMode="decimal" value={placement.feePercent} onChange={(e) => setPlacement({ ...placement, feePercent: e.target.value })} /></div>
        <div><label htmlFor="pl-guar">Guarantee (days)</label><input id="pl-guar" inputMode="numeric" value={placement.guaranteeDays} onChange={(e) => setPlacement({ ...placement, guaranteeDays: e.target.value })} /></div>
      </div>
      <p className="field-hint mt-3">The fee is calculated and stored now, so a later change to the client&apos;s fee policy cannot rewrite this revenue.</p>
    </Dialog>}
  </div>;
}

function Dialog({ title, children, onClose, onConfirm, confirmLabel, busy, disabled, danger }: {
  title: string; children: React.ReactNode; onClose: () => void; onConfirm: () => void;
  confirmLabel: string; busy: boolean; disabled?: boolean; danger?: boolean;
}) {
  return <div className="dialog-backdrop" role="dialog" aria-modal="true">
    <div className="dialog">
      <h3 className="dialog-title">{title}</h3>
      <div className="contact-form">{children}</div>
      <div className="dialog-actions">
        <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={`button ${danger ? "button-danger" : "button-primary"}`} onClick={onConfirm} disabled={busy || disabled}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </div>
  </div>;
}
