"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
        body: JSON.stringify({ ...data, next }),
      });
      const result = await response.json() as { errors?: LoginErrors; message?: string; redirectTo?: string };
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? "Unable to sign in. Please try again.");
        setStatus("error");
        return;
      }
      // Refresh so the server components pick up the new session cookie.
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
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" value={data.password}
        onChange={(event) => update("password", event.target.value)}
        aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} />
      {errors.password && <p id="password-error" className="form-error">{errors.password}</p>}
    </div>

    <button className="button button-primary mt-7 w-full justify-center" type="submit" disabled={status === "submitting"}>
      {status === "submitting" ? "Signing in…" : "Sign In"}
    </button>

    {status === "error" && message && <p className="form-status form-status--error" role="alert">{message}</p>}
  </form>;
}
