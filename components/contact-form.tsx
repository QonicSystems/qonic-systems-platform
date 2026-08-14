"use client";

import { FormEvent, useState } from "react";
import type { ContactErrors, ContactPayload } from "@/lib/contact";
import { useCaptcha } from "@/components/use-captcha";

const emptyPayload: ContactPayload = { name: "", email: "", phone: "", industry: "", message: "" };
const industries = [["it", "Information Technology"], ["non-it", "Non-IT & Corporate"], ["pharma", "Pharmaceuticals"], ["biotech", "Biotechnology"], ["medical-devices", "Medical Devices"], ["other", "Other"]];

export function ContactForm() {
  const [data, setData] = useState(emptyPayload);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const captchaToken = useCaptcha("contact");
  const update = (name: keyof ContactPayload, value: string) => { setData((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: undefined })); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setStatus("submitting"); setMessage("");
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, captchaToken: await captchaToken() }) });
      const result = await response.json() as { errors?: ContactErrors; message?: string };
      if (!response.ok) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Unable to send your request. Please try again."); setStatus("error"); return; }
      setData(emptyPayload); setErrors({}); setMessage("Thank you! We’ll be in touch within 4 business hours."); setStatus("success");
    } catch { setMessage("Unable to reach our team right now. Please try again shortly."); setStatus("error"); }
  };
  return <form className="contact-form" noValidate onSubmit={submit}>
    <div className="grid gap-6 sm:grid-cols-2"><Field label="Full Name" name="name" value={data.name} onChange={update} error={errors.name} autoComplete="name" /><Field label="Work Email" name="email" type="email" value={data.email} onChange={update} error={errors.email} autoComplete="email" /><Field label="Phone Number" name="phone" type="tel" value={data.phone ?? ""} onChange={update} autoComplete="tel" /><div><label htmlFor="industry">Industry <em>*</em></label><select id="industry" name="industry" value={data.industry} onChange={(event) => update("industry", event.target.value)} aria-invalid={Boolean(errors.industry)} aria-describedby={errors.industry ? "industry-error" : undefined}><option value="">Select your industry</option>{industries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Error name="industry" message={errors.industry} /></div></div>
    <div className="mt-6"><label htmlFor="message">How can we help? <em>*</em></label><textarea id="message" name="message" rows={5} value={data.message} onChange={(event) => update("message", event.target.value)} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "message-error" : undefined} placeholder="Tell us about the roles you need to fill, your timeline, and any specific requirements…" /><Error name="message" message={errors.message} /></div>
    <button className="button button-primary mt-8" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Sending…" : "Submit Request"}</button>
    {status !== "idle" && <p className={`form-status form-status--${status}`} role="status">{message}</p>}
  </form>;
}

function Field({ label, name, type = "text", value, onChange, error, autoComplete }: { label: string; name: keyof ContactPayload; type?: string; value: string; onChange: (name: keyof ContactPayload, value: string) => void; error?: string; autoComplete?: string }) {
  return <div><label htmlFor={name}>{label}{name !== "phone" && <em> *</em>}</label><input id={name} name={name} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} />{error && <Error name={name} message={error} />}</div>;
}

function Error({ name, message }: { name: string; message?: string }) { return message ? <p id={`${name}-error`} className="form-error">{message}</p> : null; }
