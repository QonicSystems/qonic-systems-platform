import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Set a New Password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <>
    <h1 className="auth-title">Choose a new password</h1>
    <p className="auth-subtitle">This link can only be used once and expires an hour after it was sent.</p>
    <Suspense fallback={null}><ResetPasswordForm /></Suspense>
  </>;
}
