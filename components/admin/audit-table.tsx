"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";

export type AuditRow = {
  id: string;
  when: string;
  actor: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  before: string | null;
  after: string | null;
};

/**
 * The audit log with filters, paging, and the detail that was being recorded
 * and thrown away.
 *
 * `before`, `entityType`, `entityId` and `ipAddress` are written on every
 * privileged action but the table only ever rendered `after` — so a deleted
 * account showed "—" while the name, email and role of the person removed sat
 * unused in `before`. They are behind a per-row toggle rather than inline
 * because the JSON is long and most rows are skimmed, not read.
 *
 * Filters are URL state, not component state: a filtered view of an audit log
 * is exactly the kind of thing you paste into a ticket.
 */
export function AuditTable({ entries, actors, actions, filters, page, pageCount }: {
  entries: ReadonlyArray<AuditRow>;
  actors: ReadonlyArray<{ id: string; name: string }>;
  actions: ReadonlyArray<string>;
  filters: { actor: string; action: string; from: string; to: string };
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  const apply = (key: string, value: string) => {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value); else next.delete(key);
    // Any filter change invalidates the current page number.
    next.delete("page");
    router.push(`/admin/audit?${next.toString()}`);
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams(search.toString());
    next.set("page", String(target));
    return `/admin/audit?${next.toString()}`;
  };

  const isFiltered = Boolean(filters.actor || filters.action || filters.from || filters.to);

  return <div>
    <div className="audit-filters">
      <div>
        <label htmlFor="audit-actor">Who</label>
        <select id="audit-actor" className="search-input" value={filters.actor} onChange={(event) => apply("actor", event.target.value)}>
          <option value="">Anyone</option>
          {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="audit-action">Action</label>
        <select id="audit-action" className="search-input" value={filters.action} onChange={(event) => apply("action", event.target.value)}>
          <option value="">Any action</option>
          {actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="audit-from">From</label>
        <input id="audit-from" className="search-input" type="date" value={filters.from} onChange={(event) => apply("from", event.target.value)} />
      </div>
      <div>
        <label htmlFor="audit-to">To</label>
        <input id="audit-to" className="search-input" type="date" value={filters.to} onChange={(event) => apply("to", event.target.value)} />
      </div>
      <div className="audit-filter-actions">
        {isFiltered && <button type="button" className="row-action" onClick={() => router.push("/admin/audit")}>Clear filters</button>}
        {/* Built and gated on audit.view already, but nothing linked to it. */}
        <a className="row-action" href="/api/export?type=audit">Export CSV</a>
      </div>
    </div>

    {entries.length === 0
      ? <EmptyState message="No activity recorded yet." filteredMessage="No entries match those filters." isFiltered={isFiltered} />
      : <>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead><tr>
                <th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th>
                <th scope="col">Entity</th><th scope="col">Detail</th>
              </tr></thead>
              <tbody>
                {entries.map((entry) => <Fragment key={entry.id}>
                  <tr>
                    <td>{new Date(entry.when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <th scope="row"><strong>{entry.actor}</strong>{entry.actorEmail && <span>{entry.actorEmail}</span>}</th>
                    <td><code className="audit-action">{entry.action}</code></td>
                    <td>{entry.entityType}</td>
                    <td>
                      <button type="button" className="row-action" aria-expanded={expanded === entry.id}
                        onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                        {expanded === entry.id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expanded === entry.id && <tr>
                    <td colSpan={5}>
                      <div className="audit-detail-grid">
                        <p><strong>Entity</strong> <code>{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</code></p>
                        <p><strong>IP address</strong> <code>{entry.ipAddress ?? "not recorded"}</code></p>
                        {entry.before && <div><strong>Before</strong><pre className="audit-json">{entry.before}</pre></div>}
                        {entry.after && <div><strong>After</strong><pre className="audit-json">{entry.after}</pre></div>}
                        {!entry.before && !entry.after && <p className="portal-muted">No payload recorded for this action.</p>}
                      </div>
                    </td>
                  </tr>}
                </Fragment>)}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && <div className="action-bar mt-4">
            {page > 1 && <Link className="row-action" href={pageHref(page - 1)}>← Newer</Link>}
            <span className="portal-muted">Page {page} of {pageCount}</span>
            {page < pageCount && <Link className="row-action" href={pageHref(page + 1)}>Older →</Link>}
          </div>}
        </>}
  </div>;
}
