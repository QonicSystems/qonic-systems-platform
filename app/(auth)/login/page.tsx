import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthContext } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Sign In", robots: { index: false, follow: false } };

/**
 * THE single login page. There is intentionally no per-role login URL — everyone
 * signs in here and the portal adapts to their permissions afterwards.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Already signed in? Skip the form entirely.
  if (await getAuthContext()) redirect((await searchParams).next?.startsWith("/") ? (await searchParams).next! : "/dashboard");

  return <>
    <h1 className="auth-title">Sign in to your workspace</h1>
    <p className="auth-subtitle">Use the work email address your administrator set up for you.</p>
    <Suspense fallback={null}><LoginForm /></Suspense>
  </>;
}
