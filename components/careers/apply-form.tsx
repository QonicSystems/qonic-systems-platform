"use client";

import { FormEvent, useState } from "react";

type Errors = Partial<Record<"name" | "email" | "phone" | "resumeUrl" | "consent", string>>;

export function ApplyForm({ jobId }: { jobId: string }) {
  const empty = { name: "", email: "", phone: "", resumeUrl: "", note: "", consent: false };
  const [data, setData] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (key: keyof typeof data, value: string | boolean) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting"); setMessage("");
    try {
      const response = await fetch("/api/careers/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, jobId }),
      });
      const result = await response.json() as { message?: string; errors?: Errors };
      if (!response.ok) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Unable to apply."); setStatus("error"); return; }
      setData(empty); setMessage(result.message ?? "Thank you."); setStatus("success");
    } catch { setMessage("Unable to reach us right now. Please try again shortly."); setStatus("error"); }
  };

  if (status === "success") {
    return <p className="form-status form-status--success" role="status">{message}</p>;
  }

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div>
      <label htmlFor="ap-name">Full Name <em>*</em></label>
      <input id="ap-name" value={data.name} onChange={(e) => update("name", e.target.value)} aria-invalid={Boolean(errors.name)} autoComplete="name" />
      {errors.name && <p className="form-error">{errors.name}</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="ap-email">Email <em>*</em></label>
      <input id="ap-email" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} aria-invalid={Boolean(errors.email)} autoComplete="email" />
      {errors.email && <p className="form-error">{errors.email}</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="ap-phone">Phone</label>
      <input id="ap-phone" type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
    </div>
    <div className="mt-5">
      <label htmlFor="ap-cv">Link to your CV</label>
      <input id="ap-cv" type="url" value={data.resumeUrl} onChange={(e) => update("resumeUrl", e.target.value)} aria-invalid={Boolean(errors.resumeUrl)} placeholder="https://" />
      {errors.resumeUrl ? <p className="form-error">{errors.resumeUrl}</p>
        : <p className="field-hint">Share a link — Google Drive, Dropbox, or your own site.</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="ap-note">Anything else?</label>
      <textarea id="ap-note" rows={3} value={data.note} onChange={(e) => update("note", e.target.value)} placeholder="Notice period, salary expectations, or why this role appeals." />
    </div>
    <div className="mt-5">
      <label className="inline-check">
        <input type="checkbox" checked={data.consent} onChange={(e) => update("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} />
        <span>I am happy for Avenstrix Consulting to hold my details and contact me about this and similar roles.</span>
      </label>
      {errors.consent && <p className="form-error">{errors.consent}</p>}
    </div>

    <button className="button button-primary mt-6 w-full justify-center" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Sending…" : "Apply for this role"}
    </button>
    {status === "error" && message && <p className="form-status form-status--error" role="alert">{message}</p>}
  </form>;
}
