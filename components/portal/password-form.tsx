"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Errors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;
const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(empty);
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
      const response = await fetch("/api/profile/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { errors?: Errors; message?: string };
      if (!response.ok) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Unable to update."); setStatus("error"); return; }
      setData(empty); setMessage(result.message ?? "Password updated."); setStatus("success");
      // A forced first-login change should land the user in the portal proper.
      if (mustChange) { router.replace("/dashboard"); }
      router.refresh();
    } catch { setMessage("Unable to reach the server. Please try again."); setStatus("error"); }
  };

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div>
      <label htmlFor="currentPassword">Current Password <em>*</em></label>
      <input id="currentPassword" type="password" autoComplete="current-password" value={data.currentPassword}
        onChange={(event) => update("currentPassword", event.target.value)} aria-invalid={Boolean(errors.currentPassword)} />
      {errors.currentPassword && <p className="form-error">{errors.currentPassword}</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="newPassword">New Password <em>*</em></label>
      <input id="newPassword" type="password" autoComplete="new-password" value={data.newPassword}
        onChange={(event) => update("newPassword", event.target.value)} aria-invalid={Boolean(errors.newPassword)} />
      {errors.newPassword ? <p className="form-error">{errors.newPassword}</p>
        : <p className="field-hint">At least 12 characters, with upper and lower case letters and a number.</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="confirmPassword">Confirm New Password <em>*</em></label>
      <input id="confirmPassword" type="password" autoComplete="new-password" value={data.confirmPassword}
        onChange={(event) => update("confirmPassword", event.target.value)} aria-invalid={Boolean(errors.confirmPassword)} />
      {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
    </div>

    <button className="button button-primary mt-7" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Updating…" : "Update Password"}
    </button>

    {status !== "idle" && status !== "submitting" && message && <p className={`form-status form-status--${status}`} role="status">{message}</p>}
  </form>;
}
