"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { emptyGlobalCandidateAgreementInput } from "@/lib/global-agreements/payload";

type Errors = Partial<Record<"candidateId" | "commissionTerms" | "paymentTerms" | "additionalTerms", string>>;

export function GlobalAgreementForm({ candidate }: {
  candidate: { id: string; name: string; email: string; location: string; skills: string; consented: boolean };
}) {
  const router = useRouter();
  const [form, setForm] = useState(emptyGlobalCandidateAgreementInput);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setNotice(null);
    setManualUrl(null);
    try {
      const response = await fetch("/api/global-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, ...form }),
      });
      const result = await response.json() as { message?: string; errors?: Errors; manualAcknowledgementUrl?: string | null };
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.message ?? "Unable to issue the agreement." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Agreement issued." });
      setManualUrl(result.manualAcknowledgementUrl ?? null);
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setBusy(false);
    }
  };

  if (!candidate.consented) {
    return <div className="portal-panel p-6">
      <p className="portal-note">This agreement can only be issued after {candidate.name} confirms profile-marketing consent.</p>
      <p className="mt-3"><Link className="text-link" href="/candidates">Back to Candidate Pool</Link></p>
    </div>;
  }

  return <form className="contact-form" noValidate onSubmit={submit}>
    <section className="portal-section !pt-0">
      <h2 className="portal-section-title">Candidate snapshot</h2>
      <p className="portal-note">The PDF freezes this profile snapshot. It never includes SSN, address, or identity-document numbers.</p>
      <div className="grid gap-4 mt-4 sm:grid-cols-2">
        <div><label>Candidate</label><p className="field-readonly">{candidate.name}</p></div>
        <div><label>Email</label><p className="field-readonly">{candidate.email}</p></div>
        <div><label>Location</label><p className="field-readonly">{candidate.location || "Not supplied"}</p></div>
        <div><label>Professional profile</label><p className="field-readonly">{candidate.skills || "Not supplied"}</p></div>
      </div>
    </section>

    <section className="portal-section">
      <h2 className="portal-section-title">Reusable master terms</h2>
      <p className="portal-note">Keep client-specific rates and percentages in the relevant commission schedule; this agreement sets the standing relationship only.</p>
      <div className="mt-4 grid gap-5">
        <div>
          <label htmlFor="ga-commission">Commission terms <em>*</em></label>
          <textarea id="ga-commission" value={form.commissionTerms} rows={4} onChange={(event) => setForm((value) => ({ ...value, commissionTerms: event.target.value }))} required />
          {errors.commissionTerms && <p className="field-error">{errors.commissionTerms}</p>}
        </div>
        <div>
          <label htmlFor="ga-payment">Payment terms <em>*</em></label>
          <textarea id="ga-payment" value={form.paymentTerms} rows={4} onChange={(event) => setForm((value) => ({ ...value, paymentTerms: event.target.value }))} required />
          {errors.paymentTerms && <p className="field-error">{errors.paymentTerms}</p>}
        </div>
        <div>
          <label htmlFor="ga-additional">Additional terms</label>
          <textarea id="ga-additional" value={form.additionalTerms} rows={5} maxLength={4000} onChange={(event) => setForm((value) => ({ ...value, additionalTerms: event.target.value }))} />
          {errors.additionalTerms && <p className="field-error">{errors.additionalTerms}</p>}
        </div>
      </div>
    </section>

    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
    {manualUrl && <div className="form-status form-status--success mt-4">
      <strong>Email was not delivered.</strong> Copy this one-time acknowledgement link and share it with the candidate through an approved secure channel: <a className="text-link break-all" href={manualUrl} target="_blank" rel="noreferrer">{manualUrl}</a>
    </div>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <Link className="button button-outline" href="/candidates">Cancel</Link>
      <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Issuing…" : "Issue master agreement"}</button>
    </div>
  </form>;
}
