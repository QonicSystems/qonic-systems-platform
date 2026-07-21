import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Forgot Password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <>
    <h1 className="auth-title">Reset your password</h1>
    <p className="auth-subtitle">Enter your work email and we&apos;ll send you a link to choose a new password.</p>
    <Suspense fallback={null}><ForgotPasswordForm /></Suspense>
  </>;
}
