"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";
import { COMMERCIAL_INVOICE_LABEL } from "@/lib/finance/c2c";

export type InvoiceLine = { id: string; description: string; quantity: string; unitRate: string; amount: string };
export type InvoicePayment = { id: string; amount: string; settlementAmount: string; realizedFxGainLoss: string; paidOn: string; method: string; reference: string };
export type InvoiceCreditNote = { id: string; number: string; amount: string; reason: string; issuedOn: string; issuedBy: string };

type Row = {
  id: string; number: string; client: string; project: string; status: string;
  currency: string; settlementCurrency: string; lockedSettlementRate: string; expectedSettlement: string; outstandingAmount: string;
  commercialKind: string; billingRecipient: string;
  issued: string; due: string; total: string; outstanding: string; ageing: string;
  subtotal: string; taxPercent: number; taxAmount: string; notes: string;
  grossClientAmount: string; vendorCommissionAmount: string; globalCandidateCommissionAmount: string; qonicRevenueAmount: string;
  lines: ReadonlyArray<InvoiceLine>;
  payments: ReadonlyArray<InvoicePayment>;
  creditNotes: ReadonlyArray<InvoiceCreditNote>;
  creditable: string;
};

type Draft = { description: string; quantity: string; unitRate: string };
const blankLine: Draft = { description: "", quantity: "1", unitRate: "" };

export function InvoiceManager({ invoices, clients, projects, canManage, canRecordPayment, today, dueDefault }: {
  invoices: ReadonlyArray<Row>;
  clients: ReadonlyArray<{ id: string; name: string; rateCurrency: string }>;
  projects: ReadonlyArray<{ id: string; name: string; clientId: string }>;
  canManage: boolean;
  canRecordPayment: boolean;
  /** Supplied by the server — reading the clock during render is impure. */
  today: string;
  dueDefault: string;
}) {
  const router = useRouter();
  const empty = { clientId: clients[0]?.id ?? "", projectId: "", issueDate: today, dueDate: dueDefault, taxPercent: "18", fromTimesheets: true, notes: "", currency: "INR", settlementCurrency: clients[0]?.rateCurrency ?? "INR", lockedSettlementRate: "" };
  const { query, setQuery, rows, isFiltered } = useFilter(invoices, (invoice) => [invoice.number, invoice.client, invoice.billingRecipient, invoice.project, invoice.status, invoice.commercialKind]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  // Manual lines. The API has always accepted them when `fromTimesheets` is
  // false and rejects an empty list with a 422 — the dialog never had an editor,
  // so unchecking the box could only ever fail.
  const [lines, setLines] = useState<Draft[]>([{ ...blankLine }]);
  const [paying, setPaying] = useState<Row | null>(null);
  const [payment, setPayment] = useState({ amount: "", settlementAmount: "", paidOn: today, method: "Bank transfer", reference: "" });
  const [crediting, setCrediting] = useState<Row | null>(null);
  const [credit, setCredit] = useState({ amount: "", reason: "" });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Read through the live prop so the panel refreshes with the row.
  const detail = invoices.find((i) => i.id === detailId) ?? null;

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

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      taxPercent: Number(form.taxPercent),
      ...(form.fromTimesheets ? {} : { lines: lines.filter((l) => l.description.trim() && l.unitRate.trim()) }),
    };
    if (await call("/api/invoices", payload)) { setForm(empty); setLines([{ ...blankLine }]); setOpen(false); }
  };

  const clientProjects = projects.filter((p) => p.clientId === form.clientId);
  const selectedClient = clients.find((client) => client.id === form.clientId) ?? null;
  const isForeignSettlement = Boolean(selectedClient && selectedClient.rateCurrency !== "INR" && form.settlementCurrency === "INR");
  const setLine = (index: number, patch: Partial<Draft>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const usableLines = lines.filter((l) => l.description.trim() && l.unitRate.trim());
  const draftTotal = usableLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitRate) || 0), 0);

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search invoices…" label="Search invoices">
      {canManage && <button type="button" className="button button-primary" onClick={() => setOpen(true)} disabled={clients.length === 0}>Raise an invoice</button>}
    </TableToolbar>

    {rows.length === 0
      ? <EmptyState message="No invoices yet." filteredMessage="Nothing matches that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead><tr><th scope="col">Invoice</th><th scope="col">Client / Recipient</th><th scope="col">Due</th><th scope="col">Total</th><th scope="col">Outstanding</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.map((invoice) => <tr key={invoice.id}>
            <th scope="row">
              <strong>{invoice.number}</strong>
              <span>{COMMERCIAL_INVOICE_LABEL[invoice.commercialKind] ?? invoice.commercialKind} · {invoice.project} · issued {invoice.issued}</span>
              <span className="matrix-tags">
                {invoice.payments.length > 0 && <span className="pill">{invoice.payments.length} payment{invoice.payments.length === 1 ? "" : "s"}</span>}
                {invoice.creditNotes.length > 0 && <span className="pill pill--warn">{invoice.creditNotes.length} credit note{invoice.creditNotes.length === 1 ? "" : "s"}</span>}
              </span>
            </th>
            <td>{invoice.client}{invoice.billingRecipient && <span className="portal-muted">To: {invoice.billingRecipient}</span>}</td>
            <td>{invoice.due}{invoice.ageing !== "—" && invoice.ageing !== "current" && <span className="portal-muted text-over">{invoice.ageing} days late</span>}</td>
            <td>{invoice.total}</td>
            <td>{invoice.outstanding}</td>
            <td><StatusChip status={invoice.status} /></td>
            <td>
              <div className="row-actions flex flex-wrap gap-1">
                <button type="button" className="row-action" onClick={() => setDetailId(invoice.id)}>Open</button>
                <a className="row-action" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer noopener">PDF</a>
                {canManage && invoice.status === "DRAFT" && <button type="button" className="row-action" disabled={busy} onClick={() => call(`/api/invoices/${invoice.id}`, { action: "send" })}>Issue</button>}
                {canManage && ["SENT", "PART_PAID", "OVERDUE"].includes(invoice.status) && <button type="button" className="row-action" disabled={busy} onClick={() => call(`/api/invoices/${invoice.id}`, { action: "reissue" })}>Reissue</button>}
                {canManage && !["PAID", "VOID"].includes(invoice.status) && <button type="button" className="row-action row-action--danger" disabled={busy} onClick={() => call(`/api/invoices/${invoice.id}`, { action: "void" })}>Void</button>}
                {canManage && ["DRAFT", "VOID"].includes(invoice.status) && (
                  <button
                    type="button"
                    className="row-action row-action--danger"
                    disabled={busy}
                    onClick={() => setDeleting(invoice)}
                  >
                    Delete
                  </button>
                )}
                {canRecordPayment && ["SENT", "PART_PAID", "OVERDUE"].includes(invoice.status) && <button type="button" className="row-action" disabled={busy} onClick={() => { setPaying(invoice); setPayment({ amount: invoice.outstandingAmount, settlementAmount: "", paidOn: today, method: "Bank transfer", reference: "" }); }}>Record payment</button>}
                {canManage && !["DRAFT", "VOID"].includes(invoice.status) && <button type="button" className="row-action" disabled={busy} onClick={() => { setCrediting(invoice); setCredit({ amount: "", reason: "" }); }}>Credit note</button>}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {/* ── Invoice record: lines, payments, credit notes ───────────────── */}
    {detail && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="inv-detail-title">
      <div className="dialog dialog--wide">
        <h3 id="inv-detail-title" className="dialog-title">{detail.number}</h3>
        <p className="portal-note">{COMMERCIAL_INVOICE_LABEL[detail.commercialKind] ?? detail.commercialKind} · {detail.client}{detail.billingRecipient && ` → ${detail.billingRecipient}`}{detail.project !== "—" && ` · ${detail.project}`} · issued {detail.issued} · due {detail.due}</p>

        <section className="panel-block">
          <div className="panel-block__head"><h4>Lines</h4></div>
          {detail.lines.length === 0 ? <p className="portal-muted">No lines on this invoice.</p> : <div className="matrix-scroll">
            <table className="matrix">
              <thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead>
              <tbody>
                {detail.lines.map((line) => <tr key={line.id}>
                  <td>{line.description}</td>
                  <td className="num">{line.quantity}</td>
                  <td className="num">{line.unitRate}</td>
                  <td className="num">{line.amount}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
          <p className="totals">
            <span>Subtotal <b>{detail.subtotal}</b></span>
            <span>Tax ({detail.taxPercent}%) <b>{detail.taxAmount}</b></span>
            <span>Total <b>{detail.total}</b></span>
          </p>
        </section>

        {detail.grossClientAmount && <section className="panel-block">
          <div className="panel-block__head"><h4>C2C reconciliation</h4></div>
          <p className="portal-note">Gross client amount {detail.grossClientAmount} = Qonic revenue {detail.qonicRevenueAmount} + vendor commission {detail.vendorCommissionAmount} + Global Candidate commission {detail.globalCandidateCommissionAmount}.</p>
        </section>}

        {detail.lockedSettlementRate && <section className="panel-block">
          <div className="panel-block__head"><h4>Foreign-currency settlement</h4></div>
          <p className="portal-note">This {detail.currency} invoice is contractually settled in {detail.settlementCurrency}. The invoice rate is locked at <strong>{detail.lockedSettlementRate}</strong>{detail.expectedSettlement && <>; its full invoice value at that rate is <strong>{detail.expectedSettlement}</strong></>}. Actual bank receipts may differ and are recorded as realised FX gain or loss, without changing this invoice.</p>
        </section>}

        <section className="panel-block">
          <div className="panel-block__head"><h4>Payments received</h4></div>
          {detail.payments.length === 0
            ? <p className="portal-muted">Nothing received yet.</p>
            : <ul className="timeline timeline--tight">
                {detail.payments.map((p) => <li key={p.id} className="timeline__item">
                  <div className="timeline__head">
                    <strong>{p.method || "Payment"}</strong>
                    <span className="timeline__amount">{p.settlementAmount || p.amount}</span>
                  </div>
                  <p className="timeline__meta">{p.paidOn}{p.settlementAmount && ` · ${p.amount} applied to invoice`}{p.reference && ` · ref ${p.reference}`}</p>
                  {p.realizedFxGainLoss && <p className="timeline__note">{p.realizedFxGainLoss}</p>}
                </li>)}
              </ul>}
        </section>

        <section className="panel-block">
          <div className="panel-block__head"><h4>Credit notes</h4></div>
          {detail.creditNotes.length === 0
            ? <p className="portal-muted">None issued.</p>
            : <ul className="timeline timeline--tight">
                {detail.creditNotes.map((n) => <li key={n.id} className="timeline__item">
                  <div className="timeline__head">
                    <strong>{n.number}</strong>
                    <span className="timeline__amount">−{n.amount}</span>
                  </div>
                  <p className="timeline__meta">{n.issuedOn} · {n.issuedBy}</p>
                  <p className="timeline__note">{n.reason}</p>
                  <a className="row-action" href={`/api/credit-notes/${n.id}/pdf`} target="_blank" rel="noreferrer noopener">Credit note PDF</a>
                </li>)}
              </ul>}
        </section>

        {detail.notes && <section className="panel-block">
          <div className="panel-block__head"><h4>Notes</h4></div>
          <p className="portal-note">{detail.notes}</p>
        </section>}

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setDetailId(null)}>Close</button>
        </div>
      </div>
    </div>}

    {deleting && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title">
      <div className="dialog">
        <h3 id="delete-invoice-title" className="dialog-title">Permanently delete invoice?</h3>
        <p className="portal-note"><strong>{deleting.number}</strong> will be permanently deleted. This cannot be undone.</p>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
          <button type="button" className="button button-danger" disabled={busy} onClick={async () => {
            if (await call(`/api/invoices/${deleting.id}`, {}, "DELETE")) setDeleting(null);
          }}>{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </div>
    </div>}

    {open && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <div className="dialog dialog--wide">
        <h3 id="inv-title" className="dialog-title">Raise an invoice</h3>
        <form className="contact-form" noValidate onSubmit={create}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="i-client">Client <em>*</em></label>
              <select id="i-client" value={form.clientId} onChange={(e) => {
                const nextClient = clients.find((client) => client.id === e.target.value);
                setForm({ ...form, clientId: e.target.value, projectId: "", settlementCurrency: nextClient?.rateCurrency ?? "INR", lockedSettlementRate: "" });
              }}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="i-project">Project</label>
              <select id="i-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">None</option>
                {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label htmlFor="i-issue">Issue Date</label><input id="i-issue" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
            <div><label htmlFor="i-due">Due Date</label><input id="i-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><label htmlFor="i-tax">Tax %</label><input id="i-tax" inputMode="decimal" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></div>
            {selectedClient && selectedClient.rateCurrency !== "INR" && <>
              <div>
                <label htmlFor="i-settlement">Settlement currency</label>
                <select id="i-settlement" value={form.settlementCurrency} onChange={(e) => setForm({ ...form, settlementCurrency: e.target.value, lockedSettlementRate: "" })}>
                  <option value={selectedClient.rateCurrency}>{selectedClient.rateCurrency} (same as invoice)</option>
                  <option value="INR">INR (Qonic bank account)</option>
                </select>
              </div>
              {isForeignSettlement && <div>
                <label htmlFor="i-fx-rate">Locked INR rate per {selectedClient.rateCurrency} <em>*</em></label>
                <input id="i-fx-rate" inputMode="decimal" value={form.lockedSettlementRate} onChange={(e) => setForm({ ...form, lockedSettlementRate: e.target.value })} placeholder="e.g. 95.00" />
                <p className="field-hint">Frozen for realised FX reporting; it does not change the invoice&apos;s {selectedClient.rateCurrency} value.</p>
              </div>}
            </>}
            <div className="sm:col-span-2">
              <label className="inline-check">
                <input type="checkbox" checked={form.fromTimesheets} onChange={(e) => setForm({ ...form, fromTimesheets: e.target.checked })} />
                <span>Bill approved time on this project</span>
              </label>
              <p className="field-hint">
                {form.fromTimesheets
                  ? "Pulls every approved, billable hour that has not been invoiced before, one line per person. Draft timesheets are ignored."
                  : "Enter the lines yourself — for a fixed fee, a milestone, a retainer, or a rebilled expense."}
              </p>
            </div>

            {!form.fromTimesheets && <div className="sm:col-span-2">
              <div className="panel-block__head"><h4>Invoice lines</h4></div>
              <div className="line-editor">
                {lines.map((line, index) => <div key={index} className="line-editor__row">
                  <div className="line-editor__desc">
                    <label htmlFor={`ln-d-${index}`} className="sr-only">Description</label>
                    <input id={`ln-d-${index}`} value={line.description} placeholder="Description" onChange={(e) => setLine(index, { description: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`ln-q-${index}`} className="sr-only">Quantity</label>
                    <input id={`ln-q-${index}`} inputMode="decimal" value={line.quantity} placeholder="Qty" onChange={(e) => setLine(index, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`ln-r-${index}`} className="sr-only">Unit rate</label>
                    <input id={`ln-r-${index}`} inputMode="decimal" value={line.unitRate} placeholder="Rate" onChange={(e) => setLine(index, { unitRate: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    className="row-action row-action--danger"
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>)}
              </div>
              <div className="line-editor__foot">
                <button type="button" className="row-action" onClick={() => setLines((current) => [...current, { ...blankLine }])}>Add line</button>
                <span className="totals__sum">Subtotal <b>{draftTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b></span>
              </div>
            </div>}

            <div className="sm:col-span-2"><label htmlFor="i-notes">Notes</label><textarea id="i-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy || (form.fromTimesheets ? !form.projectId : usableLines.length === 0)}>
              {busy ? "Raising…" : "Raise Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>}

    {paying && <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3 className="dialog-title">Record payment — {paying.number}</h3>
        <p className="portal-note">{paying.outstanding} outstanding.{paying.lockedSettlementRate && <> This invoice is settled in {paying.settlementCurrency} at the locked rate of {paying.lockedSettlementRate}; a different bank receipt becomes realised FX gain or loss.</>}</p>
        <div className="contact-form mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="p-amt">Invoice amount applied ({paying.currency})</label><input id="p-amt" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></div>
          {paying.lockedSettlementRate && <div><label htmlFor="p-settlement-amt">Actual amount received ({paying.settlementCurrency})</label><input id="p-settlement-amt" inputMode="decimal" value={payment.settlementAmount} onChange={(e) => setPayment({ ...payment, settlementAmount: e.target.value })} placeholder={paying.expectedSettlement || "Enter bank receipt"} /></div>}
          <div><label htmlFor="p-date">Received On</label><input id="p-date" type="date" value={payment.paidOn} onChange={(e) => setPayment({ ...payment, paidOn: e.target.value })} /></div>
          <div><label htmlFor="p-method">Method</label><input id="p-method" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} /></div>
          <div><label htmlFor="p-ref">Reference</label><input id="p-ref" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setPaying(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-primary" disabled={busy || !payment.amount || (Boolean(paying.lockedSettlementRate) && !payment.settlementAmount)}
            onClick={async () => { if (await call(`/api/invoices/${paying.id}/payments`, payment)) setPaying(null); }}>Record</button>
        </div>
      </div>
    </div>}

    {crediting && <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3 className="dialog-title">Credit note — {crediting.number}</h3>
        <p className="portal-note">
          A credit note is the correction for an invoice that has already been issued. Up to{" "}
          <strong>{crediting.creditable}</strong> can still be credited.
        </p>
        <div className="contact-form mt-4">
          <div><label htmlFor="cn-amt">Amount to credit</label><input id="cn-amt" inputMode="decimal" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></div>
          <div className="mt-4">
            <label htmlFor="cn-why">Reason</label>
            <textarea id="cn-why" rows={3} value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} placeholder="Kept against the invoice permanently — e.g. duplicate billing, agreed discount, work not delivered." />
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setCrediting(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-primary" disabled={busy || !credit.amount || credit.reason.trim().length < 3}
            onClick={async () => { if (await call(`/api/invoices/${crediting.id}/credit-notes`, credit)) setCrediting(null); }}>
            {busy ? "Issuing…" : "Issue credit note"}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}
