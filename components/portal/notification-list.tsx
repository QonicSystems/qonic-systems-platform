"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  unread: boolean;
  /** "Today", "Yesterday", or a date — grouped under this heading. */
  day: string;
  /** "2h ago" — the at-a-glance timestamp. */
  ago: string;
  /** The full timestamp, shown on hover. */
  when: string;
};

/** One glyph per kind. Notifications are scanned, so the icon carries the type. */
const KIND_ICON: Record<string, string> = {
  LEAVE: "M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  TIMESHEET: "M12 7v5l3 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z",
  CONTRACT: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h4",
  EXPENSE: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  INVOICE: "M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2ZM8 9h8M8 13h5",
  RECRUITMENT: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6",
  SYSTEM: "M12 16v-4M12 8h.01M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z",
};

const KIND_LABEL: Record<string, string> = {
  LEAVE: "Leave",
  TIMESHEET: "Timesheet",
  CONTRACT: "Contract",
  EXPENSE: "Expense",
  INVOICE: "Invoice",
  RECRUITMENT: "Recruitment",
  SYSTEM: "System",
};

export function NotificationList({ items }: { items: ReadonlyArray<NotificationItem> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [kindFilter, setKindFilter] = useState<string>("ALL");
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/notifications", { headers: { "Content-Type": "application/json" }, ...init });
      const result = await res.json().catch(() => ({})) as { message?: string };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return false;
    } finally { setBusy(false); }
  };

  const markRead = (ids?: string[]) =>
    call({ method: "POST", body: JSON.stringify(ids ? { ids } : {}) });
  const clear = (ids?: string[]) =>
    call({ method: "DELETE", body: JSON.stringify(ids ? { ids } : {}) });

  const unread = items.filter((item) => item.unread).length;
  const kinds = useMemo(() => [...new Set(items.map((i) => i.kind))].sort(), [items]);

  const visible = useMemo(
    () => items.filter((item) =>
      (filter === "ALL" || item.unread) && (kindFilter === "ALL" || item.kind === kindFilter)
    ),
    [items, filter, kindFilter]
  );

  // Grouped by day, preserving the newest-first order the server sent.
  const groups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const item of visible) {
      if (!map.has(item.day)) map.set(item.day, []);
      map.get(item.day)!.push(item);
    }
    return [...map.entries()];
  }, [visible]);

  if (items.length === 0) {
    return <div className="inbox-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p><strong>You are all caught up.</strong></p>
      <p>Approvals, issued documents and submitted timesheets will appear here.</p>
    </div>;
  }

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="inbox-bar">
      <div className="inbox-bar__filters" role="group" aria-label="Filter notifications">
        <button type="button" className="inbox-chip" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
          All <span>{items.length}</span>
        </button>
        <button type="button" className="inbox-chip" aria-pressed={filter === "UNREAD"} onClick={() => setFilter("UNREAD")}>
          Unread <span>{unread}</span>
        </button>
        {kinds.length > 1 && (
          <select
            className="inbox-select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="ALL">All types</option>
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
          </select>
        )}
      </div>
      <div className="inbox-bar__actions">
        {unread > 0 && (
          <button type="button" className="row-action" onClick={() => markRead()} disabled={busy}>
            Mark all read
          </button>
        )}
        <button
          type="button"
          className="row-action row-action--danger"
          onClick={() => { setConfirmClear(true); setNotice(null); }}
          disabled={busy}
        >
          Clear all
        </button>
      </div>
    </div>

    {visible.length === 0
      ? <p className="portal-note">Nothing matches that filter.</p>
      : groups.map(([day, entries]) => <section key={day} className="inbox-day">
          <h2 className="inbox-day__label">{day}</h2>
          <ul className="inbox">
            {entries.map((item) => <li key={item.id} className={`inbox-item${item.unread ? " is-unread" : ""}`}>
              <span className={`inbox-item__icon inbox-item__icon--${item.kind.toLowerCase()}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={KIND_ICON[item.kind] ?? KIND_ICON.SYSTEM} />
                </svg>
              </span>

              <div className="inbox-item__body">
                <div className="inbox-item__head">
                  <strong>{item.title}</strong>
                  {item.unread && <span className="inbox-dot" aria-label="Unread" />}
                </div>
                {item.body && <p className="inbox-item__text">{item.body}</p>}
                <p className="inbox-item__meta">
                  <span className="inbox-item__kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
                  <time title={item.when}>{item.ago}</time>
                </p>
              </div>

              <div className="inbox-item__actions">
                {item.link && (
                  <button
                    type="button"
                    className="row-action row-action--highlight"
                    disabled={busy}
                    onClick={async () => {
                      // Marking read must complete before navigating away, or
                      // the page we land on renders its header with the
                      // still-stale unread count — a Link's default
                      // navigation doesn't wait for this onClick's fetch.
                      if (item.unread) await markRead([item.id]);
                      router.push(item.link!);
                    }}
                  >
                    Open
                  </button>
                )}
                {item.unread && (
                  <button type="button" className="row-action" onClick={() => markRead([item.id])} disabled={busy}>
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  className="row-action row-action--danger"
                  onClick={() => clear([item.id])}
                  disabled={busy}
                  aria-label={`Delete notification: ${item.title}`}
                >
                  Delete
                </button>
              </div>
            </li>)}
          </ul>
        </section>)}

    {confirmClear && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-title">
      <div className="dialog">
        <h3 id="clear-title" className="dialog-title">Clear all notifications?</h3>
        <p className="portal-note">
          This permanently deletes all {items.length} notification{items.length === 1 ? "" : "s"} from the
          database — read and unread alike. It cannot be undone.
        </p>
        <p className="portal-note">
          Nothing is lost by clearing them: each one is a copy of something recorded properly elsewhere —
          the timesheet, the contract letter, the audit log.
        </p>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setConfirmClear(false)} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={async () => { if (await clear()) setConfirmClear(false); }}
            disabled={busy}
          >
            {busy ? "Clearing…" : "Delete them all"}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}
