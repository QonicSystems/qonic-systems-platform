"use client";

import { useState } from "react";
import { BrandLockup } from "@/components/brand";

export function ConsentResponse({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const respond = async (confirm: boolean) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/consent/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const body = await response.json() as { message?: string };
      setMessage(body.message ?? "We could not record your response. Please try again.");
      setDone(response.ok);
    } catch {
      setMessage("We could not record your response. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#f8f7f3] px-5 py-12 text-[#111111]">
    <section className="mx-auto max-w-xl rounded-2xl border border-[#e7e4da] bg-white p-7 shadow-sm">
      <BrandLockup />
      <p className="eyebrow mt-8">Qonic Systems</p>
      <h1 className="text-2xl font-bold mt-2">Profile marketing consent</h1>
      <p className="mt-4 text-sm leading-6 text-[#4f4f4f]">
        Please confirm that Qonic Systems may use your documents and professional profile to procure jobs,
        market your profile to relevant vendors and clients, and notify you when a job is procured.
      </p>
      {message && <p className="form-status form-status--success mt-5" role="status">{message}</p>}
      {!done && <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => respond(true)}>
          {busy ? "Saving…" : "I agree"}
        </button>
        <button type="button" className="button button-outline" disabled={busy} onClick={() => respond(false)}>
          I do not agree
        </button>
      </div>}
    </section>
  </main>;
}
