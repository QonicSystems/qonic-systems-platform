"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SessionRow = { id: string; current: boolean; device: string; ip: string; signedIn: string; expires: string };

export function SessionList({ sessions }: { sessions: ReadonlyArray<SessionRow> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const revokeOthers = async () => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/profile/sessions", { method: "DELETE" });
      const result = await response.json() as { message?: string };
      setNotice({ tone: response.ok ? "success" : "error", text: result.message ?? "Done." });
      if (response.ok) router.refresh();
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); }
    finally { setBusy(false); }
  };

  const others = sessions.filter((session) => !session.current).length;

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Device</th><th scope="col">IP address</th><th scope="col">Signed in</th><th scope="col">Expires</th></tr></thead>
        <tbody>
          {sessions.map((session) => <tr key={session.id}>
            <th scope="row">
              <strong>{session.device}</strong>
              {session.current && <span className="session-current">This device</span>}
            </th>
            <td>{session.ip}</td>
            <td>{session.signedIn}</td>
            <td>{session.expires}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <button type="button" className="button button-outline mt-5" onClick={revokeOthers} disabled={busy || others === 0}>
      {busy ? "Signing out…" : others === 0 ? "No other devices" : `Sign out of ${others} other device${others === 1 ? "" : "s"}`}
    </button>
  </div>;
}
