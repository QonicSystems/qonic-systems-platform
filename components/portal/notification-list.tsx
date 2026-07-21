"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Item = { id: string; kind: string; title: string; body: string | null; link: string | null; unread: boolean; when: string };

export function NotificationList({ items }: { items: ReadonlyArray<Item> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const markRead = async (ids?: string[]) => {
    setBusy(true);
    try {
      await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) });
      router.refresh();
    } finally { setBusy(false); }
  };

  if (items.length === 0) return <p className="portal-note">Nothing here yet. Approvals and issued documents will show up in this inbox.</p>;

  const unread = items.filter((item) => item.unread).length;

  return <div>
    {unread > 0 && <p><button type="button" className="button button-outline" onClick={() => markRead()} disabled={busy}>
      {busy ? "Marking…" : `Mark all ${unread} as read`}
    </button></p>}

    <ul className="notif-list">
      {items.map((item) => <li key={item.id} className={item.unread ? "is-unread" : ""}>
        <span className="notif-kind">{item.kind.toLowerCase()}</span>
        <strong>{item.title}</strong>
        {item.body && <span className="notif-body">{item.body}</span>}
        <span className="notif-when">{item.when}</span>
        {item.link && <Link className="text-link" href={item.link} onClick={() => item.unread && markRead([item.id])}>Open</Link>}
      </li>)}
    </ul>
  </div>;
}
