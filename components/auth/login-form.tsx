"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/auth/password-field";
import type { LoginErrors, LoginPayload } from "@/lib/auth/login";

const emptyPayload: LoginPayload = { email: "", password: "" };

/**
 * Follows the same contract as components/contact-form.tsx: POST JSON, read
 * `{ message, errors }`, drive a status union. The server decides where to go
 * next (`redirectTo`) so the password-change gate cannot be skipped client-side.
 */
export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [data, setData] = useState(emptyPayload);
  const [totpCode, setTotpCode] = useState("");
  // The server asks for a second factor only after the password is known-good,
  // so this flips once and then the same form re-submits with the code.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (name: keyof LoginPayload, value: string) => {
    setData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, next, ...(totpCode ? { totpCode } : {}) }),
      });
      const result = await response.json() as { errors?: LoginErrors; message?: string; redirectTo?: string; mfaRequired?: boolean };
      if (!response.ok) {
        // Without this branch the six-digit prompt had nowhere to be typed, so
        // enabling 2FA locked the account holder out of the portal entirely.
        if (result.mfaRequired) setMfaRequired(true);
        setTotpCode("");
        setErrors(result.errors ?? {});
        setMessage(result.message ?? "Unable to sign in. Please try again.");
        setStatus("error");
        return;
      }
      router.replace(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setMessage("Unable to reach the server right now. Please try again shortly.");
      setStatus("error");
    }
  };

  return <form className="contact-form" noValidate onSubmit={submit}>
    <div>
      <label htmlFor="email">Work Email</label>
      <input id="email" name="email" type="email" autoComplete="username" autoFocus value={data.email}
        onChange={(event) => update("email", event.target.value)}
        aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
      {errors.email && <p id="email-error" className="form-error">{errors.email}</p>}
    </div>

    <div className="mt-5">
      <PasswordField
        id="password"
        label="Password"
        autoComplete="current-password"
        value={data.password}
        onChange={(value) => update("password", value)}
        error={errors.password}
      />
    </div>

    {mfaRequired && <div className="mt-5">
      <label htmlFor="totpCode">Authentication Code</label>
      <input id="totpCode" name="totpCode" type="text" inputMode="numeric" autoComplete="one-time-code"
        autoFocus maxLength={11} value={totpCode} onChange={(event) => setTotpCode(event.target.value)} />
      <p className="field-hint">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
    </div>}

    <button className="button button-primary mt-7 w-full justify-center" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Signing in…" : mfaRequired ? "Verify" : "Sign In"}
    </button>

    {status === "error" && message && <p className="form-status form-status--error" role="alert">{message}</p>}

    <p className="auth-alt"><Link href="/forgot-password">Forgotten your password?</Link></p>
  </form>;
}
