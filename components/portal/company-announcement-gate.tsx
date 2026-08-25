"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type PendingCompanyAnnouncement = {
  id: string;
  title: string;
  message: string;
  releasedAt: string;
  releasedBy: string;
};

function displayDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

/**
 * A non-dismissable portal gate for CEO announcements. It receives an initial
 * server snapshot for first paint, then safely checks for new releases while a
 * person is already signed in. Each click acknowledges only the signed-in
 * person's own receipt on the server.
 */
export function CompanyAnnouncementGate({ initialAnnouncements }: { initialAnnouncements: ReadonlyArray<PendingCompanyAnnouncement> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<ReadonlyArray<PendingCompanyAnnouncement>>(initialAnnouncements);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = announcements[0];

  const synchronise = useCallback(async () => {
    if (acknowledgingId) return;
    try {
      const response = await fetch("/api/announcements/pending", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json().catch(() => ({})) as { items?: PendingCompanyAnnouncement[] };
      if (Array.isArray(result.items)) setAnnouncements(result.items);
    } catch {
      // A temporary polling failure must never unlock the portal. The existing
      // server-provided notice stays visible and the next check can recover.
    }
  }, [acknowledgingId]);

  useEffect(() => {
    // Schedule the first reconciliation after hydration rather than updating
    // state synchronously from the effect itself. React's lint rule correctly
    // treats that as a cascading render; this is the same asynchronous channel
    // as the focus listener and polling interval below.
    const firstCheck = window.setTimeout(() => { void synchronise(); }, 0);
    const interval = window.setInterval(() => { void synchronise(); }, 20_000);
    const onFocus = () => { void synchronise(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, synchronise]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [current]);

  const acknowledge = async () => {
    if (!current || acknowledgingId) return;
    setAcknowledgingId(current.id);
    setError(null);
    try {
      const response = await fetch(`/api/announcements/${current.id}/acknowledge`, { method: "POST" });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "We could not record your acknowledgement. Please try again.");
        return;
      }
      setAnnouncements((items) => items.filter((item) => item.id !== current.id));
      // Refresh the server layout's initial snapshot and the normal inbox badge
      // after the final notice is cleared. The client queue remains the source
      // of truth until then, so multiple notices stay blocking in sequence.
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setAcknowledgingId(null);
    }
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!current) return null;

  const hasMore = announcements.length > 1;
  return <div className="company-announcement-gate" role="presentation">
    <div
      ref={dialogRef}
      className="company-announcement-gate__dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="company-announcement-title"
      aria-describedby="company-announcement-message"
      tabIndex={-1}
      onKeyDown={trapFocus}
    >
      <div className="company-announcement-gate__mark" aria-hidden="true">!</div>
      <p className="eyebrow">Company announcement</p>
      <h2 id="company-announcement-title">{current.title}</h2>
      <p id="company-announcement-message" className="company-announcement-gate__message">{current.message}</p>
      <p className="company-announcement-gate__meta">Released by {current.releasedBy} · {displayDate(current.releasedAt)}</p>
      {hasMore && <p className="company-announcement-gate__queue">{announcements.length} announcements need your acknowledgement. They will be shown one at a time.</p>}
      {error && <p className="form-status form-status--error" role="alert">{error}</p>}
      <div className="company-announcement-gate__actions">
        <p>You must acknowledge this message before continuing.</p>
        <button type="button" className="button button-primary" onClick={acknowledge} disabled={acknowledgingId === current.id}>
          {acknowledgingId === current.id ? "Recording…" : "I have read this"}
        </button>
      </div>
    </div>
  </div>;
}
