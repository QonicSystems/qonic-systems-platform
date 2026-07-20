"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Errors = Partial<Record<"name" | "phone" | "jobTitle", string>>;

export function ProfileForm({ initial }: { initial: { name: string; phone: string; jobTitle: string; email: string } }) {
  const router = useRouter();
  const [data, setData] = useState({ name: initial.name, phone: initial.phone, jobTitle: initial.jobTitle });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (name: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { errors?: Errors; message?: string };
      if (!response.ok) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Unable to save."); setStatus("error"); return; }
      setMessage(result.message ?? "Profile updated."); setStatus("success"); router.refresh();
    } catch { setMessage("Unable to reach the server. Please try again."); setStatus("error"); }
  };

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor="name">Full Name <em>*</em></label>
        <input id="name" value={data.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="email">Work Email</label>
        {/* Changing an email changes an identity, so it is an administrator action. */}
        <input id="email" value={initial.email} disabled readOnly />
        <p className="field-hint">Contact your administrator to change this.</p>
      </div>
      <div>
        <label htmlFor="phone">Phone Number</label>
        <input id="phone" type="tel" value={data.phone} onChange={(event) => update("phone", event.target.value)} aria-invalid={Boolean(errors.phone)} />
        {errors.phone && <p className="form-error">{errors.phone}</p>}
      </div>
      <div>
        <label htmlFor="jobTitle">Job Title</label>
        <input id="jobTitle" value={data.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} />
      </div>
    </div>

    <button className="button button-primary mt-7" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Saving…" : "Save Changes"}
    </button>

    {status !== "idle" && status !== "submitting" && message && <p className={`form-status form-status--${status}`} role="status">{message}</p>}
  </form>;
}
