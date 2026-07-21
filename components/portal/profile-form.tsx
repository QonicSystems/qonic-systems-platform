"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/portal/avatar";

type Fields = {
  name: string; phone: string; jobTitle: string; photoUrl: string;
  address: string; emergencyName: string; emergencyPhone: string; emergencyRelation: string;
};
type Errors = Partial<Record<keyof Fields, string>>;

export function ProfileForm({ initial }: { initial: Fields & { email: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Fields>({
    name: initial.name, phone: initial.phone, jobTitle: initial.jobTitle, photoUrl: initial.photoUrl,
    address: initial.address, emergencyName: initial.emergencyName,
    emergencyPhone: initial.emergencyPhone, emergencyRelation: initial.emergencyRelation,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (name: keyof Fields, value: string) => {
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
    <div className="photo-row">
      <Avatar name={data.name} photoUrl={errors.photoUrl ? null : data.photoUrl} size={64} />
      <div className="photo-row-field">
        <label htmlFor="photoUrl">Profile Photo URL</label>
        <input id="photoUrl" type="url" inputMode="url" placeholder="https://example.com/your-photo.jpg"
          value={data.photoUrl} onChange={(event) => update("photoUrl", event.target.value)} aria-invalid={Boolean(errors.photoUrl)} />
        {errors.photoUrl ? <p className="form-error">{errors.photoUrl}</p>
          : <p className="field-hint">Link to an image hosted elsewhere. Nothing is uploaded or stored here.</p>}
      </div>
    </div>

    <div className="grid gap-5 sm:grid-cols-2 mt-6">
      <div>
        <label htmlFor="name">Full Name <em>*</em></label>
        <input id="name" value={data.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="email">Work Email</label>
        {/* Changing an email changes an identity, so it stays an administrator action. */}
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
      <div className="sm:col-span-2">
        <label htmlFor="address">Home Address</label>
        <textarea id="address" rows={2} value={data.address} onChange={(event) => update("address", event.target.value)} />
      </div>
    </div>

    <h3 className="form-section-title">Emergency contact</h3>
    <div className="grid gap-5 sm:grid-cols-3">
      <div>
        <label htmlFor="emergencyName">Name</label>
        <input id="emergencyName" value={data.emergencyName} onChange={(event) => update("emergencyName", event.target.value)} />
      </div>
      <div>
        <label htmlFor="emergencyPhone">Phone</label>
        <input id="emergencyPhone" type="tel" value={data.emergencyPhone} onChange={(event) => update("emergencyPhone", event.target.value)} aria-invalid={Boolean(errors.emergencyPhone)} />
        {errors.emergencyPhone && <p className="form-error">{errors.emergencyPhone}</p>}
      </div>
      <div>
        <label htmlFor="emergencyRelation">Relationship</label>
        <input id="emergencyRelation" value={data.emergencyRelation} onChange={(event) => update("emergencyRelation", event.target.value)} placeholder="Spouse, parent…" />
      </div>
    </div>

    <button className="button button-primary mt-7" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Saving…" : "Save Changes"}
    </button>

    {status !== "idle" && status !== "submitting" && message && <p className={`form-status form-status--${status}`} role="status">{message}</p>}
  </form>;
}
