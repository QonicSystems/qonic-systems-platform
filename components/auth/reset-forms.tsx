"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting"); setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json() as { message?: string; errors?: { email?: string } };
      if (!response.ok) { setError(result.errors?.email ?? ""); setMessage(result.message ?? "Unable to send."); setStatus("error"); return; }
      setMessage(result.message ?? "Check your inbox."); setStatus("done");
    } catch { setMessage("Unable to reach the server."); setStatus("error"); }
  };

  if (status === "done") {
    return <>
      <p className="form-status form-status--success" role="status">{message}</p>
      <p className="auth-alt"><Link href="/login">Back to sign in</Link></p>
    </>;
  }

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div>
      <label htmlFor="email">Work Email</label>
      <input id="email" type="email" autoComplete="username" autoFocus value={email}
        onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={Boolean(error)} />
      {error && <p className="form-error">{error}</p>}
    </div>
    <button className="button button-primary mt-6 w-full justify-center" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Sending…" : "Send Reset Link"}
    </button>
    {status === "error" && message && <p className="form-status form-status--error" role="alert">{message}</p>}
    <p className="auth-alt"><Link href="/login">Back to sign in</Link></p>
  </form>;
}

type ResetErrors = Partial<Record<"password" | "confirmPassword", string>>;

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [data, setData] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<ResetErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, token }) });
      const result = await response.json() as { message?: string; errors?: ResetErrors };
      if (!response.ok) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Unable to reset."); setStatus("error"); return; }
      setMessage(result.message ?? "Password reset."); setStatus("done");
      setTimeout(() => router.push("/login"), 1800);
    } catch { setMessage("Unable to reach the server."); setStatus("error"); }
  };

  if (!token) {
    return <>
      <p className="form-status form-status--error" role="alert">This reset link is incomplete. Please request a new one.</p>
      <p className="auth-alt"><Link href="/forgot-password">Request a new link</Link></p>
    </>;
  }

  if (status === "done") {
    return <>
      <p className="form-status form-status--success" role="status">{message}</p>
      <p className="auth-alt"><Link href="/login">Continue to sign in</Link></p>
    </>;
  }

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div>
      <label htmlFor="password">New Password</label>
      <input id="password" type="password" autoComplete="new-password" autoFocus value={data.password}
        onChange={(event) => { setData((c) => ({ ...c, password: event.target.value })); setErrors((c) => ({ ...c, password: undefined })); }}
        aria-invalid={Boolean(errors.password)} />
      {errors.password ? <p className="form-error">{errors.password}</p>
        : <p className="field-hint">At least 12 characters, with upper and lower case letters and a number.</p>}
    </div>
    <div className="mt-5">
      <label htmlFor="confirmPassword">Confirm New Password</label>
      <input id="confirmPassword" type="password" autoComplete="new-password" value={data.confirmPassword}
        onChange={(event) => { setData((c) => ({ ...c, confirmPassword: event.target.value })); setErrors((c) => ({ ...c, confirmPassword: undefined })); }}
        aria-invalid={Boolean(errors.confirmPassword)} />
      {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
    </div>
    <button className="button button-primary mt-6 w-full justify-center" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Saving…" : "Set New Password"}
    </button>
    {status === "error" && message && <p className="form-status form-status--error" role="alert">{message}</p>}
  </form>;
}
