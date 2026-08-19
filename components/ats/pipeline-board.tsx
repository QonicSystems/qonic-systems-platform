"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/status-chip";

type Stage = { key: string; label: string };

export type BoardInterview = {
  id: string;
  scheduledAt: string;
  durationMins: number;
  kind: string;
  location: string;
  interviewer: string;
  outcome: string;
  score: number | null;
  feedback: string;
};

export type BoardEvent = {
  id: string;
  from: string | null;
  to: string;
  actor: string;
  note: string;
  at: string;
};

export type BoardApplication = {
  id: string; candidateName: string; candidateHeadline: string; resumeUrl: string | null;
  stage: string; interviews: number; lastScore: number | null; placed: boolean;
  outcomeReason: string | null; available: ReadonlyArray<Stage>;
  interviewList: ReadonlyArray<BoardInterview>;
  history: ReadonlyArray<BoardEvent>;
};

const INTERVIEW_KINDS = ["Screening", "Technical", "Client panel", "Culture fit", "Final"];
const OUTCOMES = [
  { key: "PENDING", label: "Still pending" },
  { key: "ADVANCE", label: "Advance" },
  { key: "REJECT", label: "Reject" },
  { key: "NO_SHOW", label: "No show" },
];

export function PipelineBoard({ jobId, stages, applications, addableCandidates, interviewers, canManage, canPlace }: {
  jobId: string;
  stages: ReadonlyArray<Stage>;
  applications: ReadonlyArray<BoardApplication>;
  addableCandidates: ReadonlyArray<{ id: string; label: string }>;
  interviewers: ReadonlyArray<{ id: string; name: string }>;
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [placement, setPlacement] = useState({ startDate: "", salary: "", feePercent: "12.5", guaranteeDays: "90" });

  // Read from the live prop so the panel re-renders with fresh data after a
  // router.refresh() instead of holding a stale copy of the application.
  const detail = applications.find((a) => a.id === detailId) ?? null;

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
            <button type="button" className="board-open" onClick={() => setDetailId(app.id)}>
              {app.interviews === 0 ? "No interviews" : `${app.interviews} interview${app.interviews === 1 ? "" : "s"}`}
              {app.lastScore !== null && ` · ${app.lastScore}/5`}
              <span aria-hidden="true"> →</span>
            </button>
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
          <thead><tr><th scope="col">Candidate</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Record</th></tr></thead>
          <tbody>
            {closed.map((app) => <tr key={app.id}>
              <th scope="row"><strong>{app.candidateName}</strong></th>
              <td><StatusChip status={app.stage} /></td>
              <td>{app.outcomeReason ?? "—"}</td>
              <td><button type="button" className="row-action" onClick={() => setDetailId(app.id)}>View</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {detail && <ApplicationPanel
      app={detail}
      interviewers={interviewers}
      canManage={canManage}
      busy={busy}
      onClose={() => setDetailId(null)}
      onSchedule={(payload) => call(`/api/applications/${detail.id}/interviews`, payload)}
      onFeedback={(payload) => call(`/api/applications/${detail.id}/interviews`, payload, "PATCH")}
    />}

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

/**
 * Everything held about one application: the interviews, a form to schedule
 * another, a scorecard for each, and the stage history.
 *
 * The history has always been written by the stage routes and was never shown
 * anywhere — it is read-only here, newest first.
 */
function ApplicationPanel({ app, interviewers, canManage, busy, onClose, onSchedule, onFeedback }: {
  app: BoardApplication;
  interviewers: ReadonlyArray<{ id: string; name: string }>;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onSchedule: (payload: Record<string, unknown>) => Promise<boolean>;
  onFeedback: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [form, setForm] = useState({ scheduledAt: "", durationMins: "60", kind: "Screening", location: "", interviewerId: "" });
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [score, setScore] = useState({ outcome: "ADVANCE", score: "", feedback: "" });

  const startScoring = (interview: BoardInterview) => {
    setScoringId(interview.id);
    setScore({
      outcome: interview.outcome === "PENDING" ? "ADVANCE" : interview.outcome,
      score: interview.score === null ? "" : String(interview.score),
      feedback: interview.feedback,
    });
  };

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="app-panel-title">
    <div className="dialog dialog--wide">
      <h3 id="app-panel-title" className="dialog-title">{app.candidateName}</h3>
      <p className="portal-note">{app.candidateHeadline || "Pipeline record"}</p>

      <section className="panel-block">
        <div className="panel-block__head">
          <h4>Interviews</h4>
          {canManage && !scheduling && (
            <button type="button" className="row-action row-action--primary" onClick={() => setScheduling(true)}>Schedule interview</button>
          )}
        </div>

        {scheduling && <div className="contact-form panel-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="iv-at">Date &amp; time <em>*</em></label>
              <input id="iv-at" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="iv-dur">Duration (minutes)</label>
              <input id="iv-dur" inputMode="numeric" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} />
            </div>
            <div>
              <label htmlFor="iv-kind">Type</label>
              <select id="iv-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {INTERVIEW_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="iv-who">Interviewer</label>
              <select id="iv-who" value={form.interviewerId} onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}>
                <option value="">Unassigned</option>
                {interviewers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="iv-loc">Location or link</label>
              <input id="iv-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Google Meet link, office, phone…" />
            </div>
          </div>
          <p className="field-hint">Scheduling moves the candidate to the Interview stage if they are not there already.</p>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setScheduling(false)} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !form.scheduledAt}
              onClick={async () => {
                const ok = await onSchedule({ ...form, durationMins: Number(form.durationMins) });
                if (ok) { setScheduling(false); setForm({ ...form, scheduledAt: "", location: "" }); }
              }}
            >
              {busy ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </div>}

        {app.interviewList.length === 0 && !scheduling
          ? <p className="portal-muted">No interviews recorded yet.</p>
          : <ul className="timeline">
              {app.interviewList.map((interview) => <li key={interview.id} className="timeline__item">
                <div className="timeline__head">
                  <strong>{interview.kind}</strong>
                  <StatusChip status={interview.outcome} />
                  {interview.score !== null && <span className="timeline__score">{interview.score}/5</span>}
                </div>
                <p className="timeline__meta">
                  {interview.scheduledAt} · {interview.durationMins} min
                  {interview.interviewer && ` · ${interview.interviewer}`}
                  {interview.location && ` · ${interview.location}`}
                </p>
                {interview.feedback && <p className="timeline__note">{interview.feedback}</p>}

                {canManage && scoringId === interview.id ? <div className="contact-form panel-form">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`out-${interview.id}`}>Outcome</label>
                      <select id={`out-${interview.id}`} value={score.outcome} onChange={(e) => setScore({ ...score, outcome: e.target.value })}>
                        {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`sc-${interview.id}`}>Score (1–5)</label>
                      <input id={`sc-${interview.id}`} inputMode="numeric" value={score.score} onChange={(e) => setScore({ ...score, score: e.target.value })} placeholder="Optional" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`fb-${interview.id}`}>Feedback</label>
                      <textarea id={`fb-${interview.id}`} rows={3} value={score.feedback} onChange={(e) => setScore({ ...score, feedback: e.target.value })} placeholder="Required for any outcome other than still pending." />
                    </div>
                  </div>
                  <div className="dialog-actions">
                    <button type="button" className="button button-outline" onClick={() => setScoringId(null)} disabled={busy}>Cancel</button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await onFeedback({ interviewId: interview.id, ...score });
                        if (ok) setScoringId(null);
                      }}
                    >
                      {busy ? "Saving…" : "Save scorecard"}
                    </button>
                  </div>
                </div> : canManage && (
                  <button type="button" className="row-action" onClick={() => startScoring(interview)} disabled={busy}>
                    {interview.outcome === "PENDING" ? "Record feedback" : "Edit scorecard"}
                  </button>
                )}
              </li>)}
            </ul>}
      </section>

      <section className="panel-block">
        <div className="panel-block__head"><h4>Stage history</h4></div>
        {app.history.length === 0
          ? <p className="portal-muted">Nothing recorded yet.</p>
          : <ul className="timeline timeline--tight">
              {app.history.map((event) => <li key={event.id} className="timeline__item">
                <div className="timeline__head">
                  <strong>{event.from ? `${event.from} → ${event.to}` : event.to}</strong>
                </div>
                <p className="timeline__meta">{event.at} · {event.actor}</p>
                {event.note && <p className="timeline__note">{event.note}</p>}
              </li>)}
            </ul>}
      </section>

      <div className="dialog-actions">
        <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </div>
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
