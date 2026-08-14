import { createHash, randomBytes } from "node:crypto";

// Re-exported so Node-side callers have one import, while middleware.ts imports
// the constant directly from lib/auth/cookie.ts to stay Edge-safe.
export { SESSION_COOKIE } from "@/lib/auth/cookie";

/** Idle timeout — rolled forward while the session is in use. */
export const IDLE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
/** Hard cap — never extended, so a stolen cookie cannot live indefinitely. */
export const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Only rewrite the cookie/row when the session is older than this, to avoid a write per request. */
export const REFRESH_AFTER_MS = 60 * 60 * 1000; // 1 hour

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Only the hash is stored. A database leak therefore yields no usable sessions.
 * SHA-256 is correct here (not argon2) — the token is 256 bits of entropy, so
 * there is nothing to brute-force and per-request hashing must stay cheap.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Guards the post-login `?next=` redirect against open redirects. Only a
 * same-site absolute path is allowed — `//evil.com` and `https://evil.com` are
 * both rejected, and so is anything that isn't a portal path.
 *
 * Resolved through the URL parser rather than matched as a string, because the
 * browser's parser accepts forms a prefix check does not anticipate: `/\evil.com`
 * starts with a single "/" yet WHATWG treats the backslash as a slash, so it
 * resolves to https://evil.com/. That mattered here because the redirect fires
 * *after* a genuine login on the real domain, which is exactly what makes a
 * phishing landing page convincing.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;

  const base = "https://redirect.invalid";
  let url: URL;
  try { url = new URL(value, base); } catch { return fallback; }

  // Anything that escaped the base origin was absolute, protocol-relative, or
  // used a separator the parser normalises away.
  if (url.origin !== base) return fallback;
  if (url.pathname.startsWith("/api/")) return fallback;

  return `${url.pathname}${url.search}`;
}
