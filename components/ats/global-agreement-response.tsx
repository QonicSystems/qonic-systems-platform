"use client";

import { useState } from "react";
import { BrandLockup } from "@/components/brand";

/** The public, no-login response screen for a one-time agreement link. */
export function GlobalAgreementResponse({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const respond = async (confirm: boolean) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/global-agreements/acknowledge/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const body = await response.json() as { message?: string };
      setMessage(body.message ?? "We could not record your response. Please try again.");
      setDone(response.ok || response.status === 409);
    } catch {
      setMessage("We could not record your response. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#f8f7f3] px-5 py-12 text-[#111111]">
    <section className="mx-auto max-w-xl rounded-2xl border border-[#e7e4da] bg-white p-7 shadow-sm">
      <BrandLockup />
      <p className="eyebrow mt-8">QONIC consulting</p>
      <h1 className="mt-2 text-2xl font-bold">Global Candidate agreement</h1>
      <p className="mt-4 text-sm leading-6 text-[#4f4f4f]">
        Your email includes the master representation and commission agreement as a PDF. It is not an employment agreement and does not create a Qonic Systems account.
      </p>
      <p className="mt-3 text-sm leading-6 text-[#4f4f4f]">
        Please review the attachment, then record whether you accept its representation and commission terms.
      </p>
      {message && <p className="form-status form-status--success mt-5" role="status">{message}</p>}
      {!done && <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => respond(true)}>
          {busy ? "Saving…" : "I accept"}
        </button>
        <button type="button" className="button button-outline" disabled={busy} onClick={() => respond(false)}>
          I decline
        </button>
      </div>}
    </section>
  </main>;
}
