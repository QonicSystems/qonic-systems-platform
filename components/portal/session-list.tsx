"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

export type SessionRow = { id: string; current: boolean; device: string; ip: string; signedIn: string; expires: string };

export function SessionList({ sessions }: { sessions: ReadonlyArray<SessionRow> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { query, setQuery, rows, isFiltered } = useFilter(sessions, (session) => [
    session.device, session.ip, session.signedIn, session.expires, session.current ? "this device current" : "other device",
  ]);

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

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search device or IP address…" label="Search active sessions" />
    {rows.length === 0
      ? <EmptyState message="No active sessions are recorded." filteredMessage="No active sessions match that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Device</th><th scope="col">IP address</th><th scope="col">Signed in</th><th scope="col">Expires</th></tr></thead>
        <tbody>
          {rows.map((session) => <tr key={session.id}>
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
    </div>}

    <button type="button" className="button button-outline mt-5" onClick={revokeOthers} disabled={busy || others === 0}>
      {busy ? "Signing out…" : others === 0 ? "No other devices" : `Sign out of ${others} other device${others === 1 ? "" : "s"}`}
    </button>
  </div>;
}
