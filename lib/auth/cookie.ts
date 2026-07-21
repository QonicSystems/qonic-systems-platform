/**
 * Edge-safe constants only.
 *
 * middleware.ts runs on the Edge runtime, which has no `node:crypto`. Importing
 * lib/auth/session.ts from there would drag that in and crash the whole
 * middleware module at load time, so the shared cookie name lives here alone.
 * Do not add Node-dependent code to this file.
 */
export const SESSION_COOKIE = "avx_session";
