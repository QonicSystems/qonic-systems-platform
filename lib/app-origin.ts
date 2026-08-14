import { site } from "@/lib/site";

/**
 * The origin that outbound links (password-reset emails) must point at.
 *
 * Deliberately NOT derived from the incoming request. `Host` is supplied by the
 * caller, so a reset link built from `new URL(request.url).origin` is handed to
 * whoever set the header — the classic reset-poisoning path to account
 * takeover. Vercel only routes its attached domains and deploy/Caddyfile
 * matches explicit hostnames, so this is insurance against a future wildcard
 * domain or catch-all rule rather than a hole that is open today.
 *
 * Set APP_ORIGIN to override (preview deployments, a staging hostname).
 */
export function appOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return `https://${site.domain}`;
}
