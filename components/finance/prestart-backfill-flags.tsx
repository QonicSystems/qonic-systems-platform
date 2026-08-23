"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PrestartBackfillFlag = {
  projectId: string;
  userId: string;
  developer: string;
  clientProject: string;
  projectStart: string;
  actualStart: string;
  unfiledDays: string[];
  reopenable: boolean;
};

/** CEO/Co-Founder controls for delivery days that could become retained value. */
export function PrestartBackfillFlags({ flags }: { flags: PrestartBackfillFlag[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function reopen(flag: PrestartBackfillFlag) {
    const id = `${flag.projectId}:${flag.userId}`;
    setBusyId(id); setNotice(null);
    try {
      const response = await fetch(`/api/projects/${flag.projectId}/prestart-backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: flag.userId }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Unable to reopen the missing period." });
      if (response.ok) router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusyId(null);
    }
  }

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <div className="matrix-scroll"><table className="matrix matrix--people">
      <thead><tr><th scope="col">Developer</th><th scope="col">Client / Project</th><th scope="col">Project start</th><th scope="col">Actual start</th><th scope="col">Unfiled pre-start days</th><th scope="col">Action</th></tr></thead>
      <tbody>{flags.map((flag) => {
        const id = `${flag.projectId}:${flag.userId}`;
        return <tr key={id}>
          <th scope="row">{flag.developer}</th>
          <td>{flag.clientProject}</td>
          <td>{flag.projectStart}</td>
          <td>{flag.actualStart}</td>
          <td><span className="matrix-cell-primary"><strong>{flag.unfiledDays.length} working {flag.unfiledDays.length === 1 ? "day" : "days"}</strong></span><span className="matrix-cell-subline">{flag.unfiledDays.join(" · ")}</span></td>
          <td>{flag.reopenable
            ? <button type="button" className="row-action row-action--highlight" disabled={busyId !== null} onClick={() => reopen(flag)}>{busyId === id ? "Reopening…" : `Reopen ${flag.unfiledDays.length} days`}</button>
            : <span className="portal-muted">Invoiced week — finance review required</span>}
          </td>
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}
