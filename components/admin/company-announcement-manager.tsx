"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { COMPANY_ANNOUNCEMENT_LIMITS, mayDeleteCompanyAnnouncement, type CompanyAnnouncementStatus } from "@/lib/company-announcements";
import { useFilter } from "@/lib/ui/filter";

export type CompanyAnnouncementRow = {
  id: string;
  title: string;
  message: string;
  status: CompanyAnnouncementStatus;
  releasedAt: string;
  revokedAt: string | null;
  releasedBy: string;
  recipientCount: number;
  acknowledgedCount: number;
};

type FormErrors = Partial<Record<"title" | "message", string>>;
type ReceiptStatus = "OUTSTANDING" | "ACKNOWLEDGED";
type Recipient = { name: string; email: string; role: string; acknowledgedAt: string | null };
type RecipientResult = { items: Recipient[]; total: number; page: number; pageCount: number; status: ReceiptStatus };
type ManagementAction = { kind: "REVOKE" | "DELETE"; id: string; title: string };

const initialForm = { title: "", message: "" };

function displayDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

export function CompanyAnnouncementManager({ announcements }: { announcements: ReadonlyArray<CompanyAnnouncementRow> }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [pendingAction, setPendingAction] = useState<ManagementAction | null>(null);
  const [acting, setActing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<RecipientResult | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<ReceiptStatus>("OUTSTANDING");
  const [receiptQuery, setReceiptQuery] = useState("");
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // A CEO can quickly switch announcements or acknowledgement filters. Ignore
  // a slower, older response so it can never overwrite the panel they are now
  // looking at with a different announcement's people.
  const receiptRequest = useRef(0);
  const { query, setQuery, rows: visibleAnnouncements, isFiltered } = useFilter(
    announcements,
    (announcement) => [announcement.title, announcement.message, announcement.releasedBy, announcement.releasedAt],
  );

  const release = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReleasing(true);
    setNotice(null);
    setErrors({});
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: FormErrors };
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to release this announcement." });
        return;
      }
      setForm(initialForm);
      setNotice({ tone: "success", text: result.message ?? "Company announcement released." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server. Please try again." });
    } finally {
      setReleasing(false);
    }
  };

  const loadRecipients = async (announcementId: string, nextStatus = receiptStatus, nextQuery = receiptQuery, page = 1) => {
    const requestId = ++receiptRequest.current;
    setLoadingReceipts(true);
    setReceiptError(null);
    try {
      const search = new URLSearchParams({ status: nextStatus, page: String(page) });
      if (nextQuery.trim()) search.set("q", nextQuery.trim());
      const response = await fetch(`/api/admin/announcements/${announcementId}/recipients?${search.toString()}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as RecipientResult & { message?: string };
      if (requestId !== receiptRequest.current) return;
      if (!response.ok) {
        setReceipts(null);
        setReceiptError(result.message ?? "Unable to load acknowledgement progress.");
        return;
      }
      setReceipts(result);
    } catch {
      if (requestId !== receiptRequest.current) return;
      setReceipts(null);
      setReceiptError("Unable to reach the server.");
    } finally {
      if (requestId === receiptRequest.current) setLoadingReceipts(false);
    }
  };

  const toggleRecipients = (announcementId: string) => {
    if (expandedId === announcementId) {
      receiptRequest.current += 1;
      setExpandedId(null);
      setReceipts(null);
      setReceiptError(null);
      return;
    }
    setExpandedId(announcementId);
    setReceiptStatus("OUTSTANDING");
    setReceiptQuery("");
    setReceipts(null);
    void loadRecipients(announcementId, "OUTSTANDING", "");
  };

  const changeReceiptStatus = (value: ReceiptStatus) => {
    if (!expandedId) return;
    setReceiptStatus(value);
    void loadRecipients(expandedId, value, receiptQuery);
  };

  const searchRecipients = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (expandedId) void loadRecipients(expandedId, receiptStatus, receiptQuery);
  };

  const completeManagementAction = async () => {
    if (!pendingAction) return;
    setActing(true);
    setNotice(null);
    try {
      const endpoint = pendingAction.kind === "REVOKE"
        ? `/api/admin/announcements/${pendingAction.id}/revoke`
        : `/api/admin/announcements/${pendingAction.id}`;
      const response = await fetch(endpoint, { method: pendingAction.kind === "REVOKE" ? "POST" : "DELETE" });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that announcement action." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Announcement updated." });
      setPendingAction(null);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server. Please try again." });
    } finally {
      setActing(false);
    }
  };

  return <div className="announcement-workspace">
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <section className="announcement-composer" aria-labelledby="announcement-compose-title">
      <div className="announcement-composer__lead">
        <p className="eyebrow">CEO release control</p>
        <h3 id="announcement-compose-title">Publish a mandatory message</h3>
        <p>It appears as a full-screen notice for active People accounts only. They cannot use portal navigation until they select “I have read this”.</p>
      </div>
      <form className="announcement-composer__form" noValidate onSubmit={release}>
        <div>
          <label htmlFor="announcement-title">Title <em>*</em></label>
          <input
            id="announcement-title"
            value={form.title}
            maxLength={COMPANY_ANNOUNCEMENT_LIMITS.title}
            placeholder="e.g. Important company update"
            onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); setErrors((current) => ({ ...current, title: undefined })); }}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "announcement-title-error" : undefined}
          />
          {errors.title && <p id="announcement-title-error" className="field-error">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor="announcement-message">Message <em>*</em></label>
          <textarea
            id="announcement-message"
            rows={5}
            value={form.message}
            maxLength={COMPANY_ANNOUNCEMENT_LIMITS.message}
            placeholder="Write the information every person must read and acknowledge."
            onChange={(event) => { setForm((current) => ({ ...current, message: event.target.value })); setErrors((current) => ({ ...current, message: undefined })); }}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "announcement-message-error" : "announcement-message-hint"}
          />
          {errors.message
            ? <p id="announcement-message-error" className="field-error">{errors.message}</p>
            : <p id="announcement-message-hint" className="field-hint">{form.message.length.toLocaleString()} / {COMPANY_ANNOUNCEMENT_LIMITS.message.toLocaleString()} characters</p>}
        </div>
        <div className="announcement-composer__actions">
          <p>Recipients are active accounts added through People only. The CEO, Developers, and all Global Candidates are excluded.</p>
          <button type="submit" className="button button-primary" disabled={releasing}>
            {releasing ? "Releasing…" : "Release to company"}
          </button>
        </div>
      </form>
    </section>

    <section className="announcement-history" aria-labelledby="announcement-history-title">
      <div className="announcement-history__head">
        <div>
          <p className="eyebrow">Acknowledgement record</p>
          <h3 id="announcement-history-title">Released announcements</h3>
        </div>
        <p>{announcements.length === 0 ? "No announcements have been released." : `${announcements.length.toLocaleString()} shown · newest first`}</p>
      </div>
      <TableToolbar search={query} onSearch={setQuery} placeholder="Search announcements…" label="Search announcements">
        {isFiltered && <button type="button" className="row-action" onClick={() => setQuery("")}>Clear search</button>}
      </TableToolbar>

      {visibleAnnouncements.length === 0
        ? <EmptyState message="No company announcements have been released." filteredMessage="No announcements match that search." isFiltered={isFiltered} />
        : <div className="matrix-scroll">
            <table className="matrix announcement-table">
              <thead><tr><th scope="col">Announcement</th><th scope="col">Released</th><th scope="col">Status</th><th scope="col">Acknowledged</th><th scope="col">Outstanding</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visibleAnnouncements.map((announcement) => {
                  const outstanding = Math.max(0, announcement.recipientCount - announcement.acknowledgedCount);
                  const canDelete = mayDeleteCompanyAnnouncement({
                    status: announcement.status,
                    recipientCount: announcement.recipientCount,
                    acknowledgedCount: announcement.acknowledgedCount,
                  });
                  const expanded = expandedId === announcement.id;
                  return <Fragment key={announcement.id}>
                    <tr>
                      <th scope="row">
                        <strong>{announcement.title}</strong>
                        <p className="announcement-table__message">{announcement.message}</p>
                      </th>
                      <td><strong>{displayDate(announcement.releasedAt)}</strong><span className="portal-muted">by {announcement.releasedBy}</span></td>
                      <td>{announcement.status === "REVOKED"
                        ? <span className="status-chip status-chip--revoked">Revoked{announcement.revokedAt ? ` · ${displayDate(announcement.revokedAt)}` : ""}</span>
                        : <span className="status-chip status-chip--released">Live</span>}</td>
                      <td><span className="status-chip status-chip--acknowledged">{announcement.acknowledgedCount} / {announcement.recipientCount}</span></td>
                      <td>{announcement.status === "REVOKED"
                        ? <span className="portal-muted">Gate stopped</span>
                        : outstanding === 0 ? <span className="status-chip status-chip--released">All read</span> : <span className="status-chip status-chip--pending">{outstanding} waiting</span>}</td>
                      <td><div className="row-actions">
                        <button type="button" className="row-action row-action--highlight" onClick={() => toggleRecipients(announcement.id)} aria-expanded={expanded} disabled={acting}>
                          {expanded ? "Hide people" : "View people"}
                        </button>
                        {announcement.status === "RELEASED" && outstanding > 0 && <button type="button" className="row-action row-action--danger" onClick={() => setPendingAction({ kind: "REVOKE", id: announcement.id, title: announcement.title })} disabled={acting}>Revoke</button>}
                        {canDelete && <button type="button" className="row-action row-action--danger" onClick={() => setPendingAction({ kind: "DELETE", id: announcement.id, title: announcement.title })} disabled={acting}>Delete read</button>}
                      </div></td>
                    </tr>
                    {expanded && <tr className="announcement-detail"><td colSpan={6}>
                      <div className="announcement-detail__panel">
                        <div className="announcement-detail__head">
                          <div>
                            <strong>Read status</strong>
                            <p>Only the CEO can see this acknowledgement record.</p>
                          </div>
                          <div className="announcement-detail__filters" role="group" aria-label="Filter acknowledgement status">
                            <button type="button" className="inbox-chip" aria-pressed={receiptStatus === "OUTSTANDING"} onClick={() => changeReceiptStatus("OUTSTANDING")}>Waiting</button>
                            <button type="button" className="inbox-chip" aria-pressed={receiptStatus === "ACKNOWLEDGED"} onClick={() => changeReceiptStatus("ACKNOWLEDGED")}>Read</button>
                          </div>
                        </div>
                        <form className="announcement-detail__search" onSubmit={searchRecipients}>
                          <label htmlFor={`announcement-recipient-search-${announcement.id}`}>Find a person</label>
                          <input id={`announcement-recipient-search-${announcement.id}`} value={receiptQuery} placeholder="Name or email" onChange={(event) => setReceiptQuery(event.target.value)} />
                          <button type="submit" className="row-action" disabled={loadingReceipts}>Search</button>
                        </form>
                        {receiptError && <p className="form-status form-status--error" role="alert">{receiptError}</p>}
                        {loadingReceipts && <p className="portal-muted">Loading acknowledgement record…</p>}
                        {!loadingReceipts && receipts && <>
                          <p className="portal-muted">{receipts.total.toLocaleString()} {receipts.status === "OUTSTANDING" ? "still waiting" : "acknowledged"}</p>
                          {receipts.items.length === 0
                            ? <p className="portal-note">No people match this filter.</p>
                            : <div className="matrix-scroll"><table className="matrix announcement-recipients"><thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Status</th></tr></thead><tbody>
                                {receipts.items.map((recipient) => <tr key={recipient.email}><th scope="row"><strong>{recipient.name}</strong><span className="portal-muted">{recipient.email}</span></th><td>{recipient.role}</td><td>{recipient.acknowledgedAt ? <span className="status-chip status-chip--acknowledged">Read · {displayDate(recipient.acknowledgedAt)}</span> : <span className="status-chip status-chip--pending">Waiting</span>}</td></tr>)}
                              </tbody></table></div>}
                          {receipts.pageCount > 1 && <div className="announcement-detail__pagination">
                            <button type="button" className="row-action" disabled={loadingReceipts || receipts.page <= 1} onClick={() => void loadRecipients(announcement.id, receiptStatus, receiptQuery, receipts.page - 1)}>← Newer</button>
                            <span className="portal-muted">Page {receipts.page} of {receipts.pageCount}</span>
                            <button type="button" className="row-action" disabled={loadingReceipts || receipts.page >= receipts.pageCount} onClick={() => void loadRecipients(announcement.id, receiptStatus, receiptQuery, receipts.page + 1)}>Older →</button>
                          </div>}
                        </>}
                      </div>
                    </td></tr>}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>}
    </section>
    {pendingAction && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="announcement-action-title">
      <div className="dialog">
        <h3 id="announcement-action-title" className="dialog-title">
          {pendingAction.kind === "REVOKE" ? "Revoke this announcement?" : "Delete this read announcement?"}
        </h3>
        <p className="portal-note"><strong>{pendingAction.title}</strong></p>
        {pendingAction.kind === "REVOKE"
          ? <p className="portal-note">This stops the popup immediately for anyone still waiting. The announcement and its acknowledgement record remain visible to the CEO for audit.</p>
          : <p className="portal-note">Every recipient has read this announcement. Deleting removes the announcement and its acknowledgement receipts; the audit log remains.</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setPendingAction(null)} disabled={acting}>Cancel</button>
          <button type="button" className="button button-danger" onClick={completeManagementAction} disabled={acting}>
            {acting ? "Working…" : pendingAction.kind === "REVOKE" ? "Revoke announcement" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}
