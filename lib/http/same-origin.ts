import { NextResponse } from "next/server";

/** Anything with a `get`, so both `Request.headers` and next/headers work. */
type HeaderSource = { get(name: string): string | null };

/**
 * Rejects cross-site requests — the CSRF defence for this app.
 *
 * There are no Server Actions here, so every state-changing endpoint is a plain
 * Route Handler, which Next does not protect. The session cookie is
 * `SameSite=Lax`, and that blocks cross-*site* POSTs — but "site" means the
 * registrable domain, so qonicsystems.com and shutterpact.qonicsystems.com are
 * same-site with the portal and Lax lets their requests straight through. Given
 * that three hostnames deliberately share one apex (see middleware.ts), an HTML
 * injection or subdomain takeover on either sibling would otherwise be a full
 * CSRF capability against /api/admin/*.
 *
 * Compares Origin against Host rather than a hardcoded domain, so previews,
 * localhost, and the e2e server all work without configuration. A *missing*
 * Origin is allowed: browsers always send it on cross-origin state-changing
 * requests, so absence means a non-browser caller (curl, tests,
 * server-to-server), which is not the threat CSRF describes.
 */
export function crossSiteRejection(headers: HeaderSource): NextResponse | null {
  const origin = headers.get("origin");
  if (!origin) return null;

  const host = headers.get("host");
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { return forbidden(); }

  if (host && originHost === host) return null;

  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try { if (new URL(configured).host === originHost) return null; } catch { /* ignore a malformed override */ }
  }

  return forbidden();
}

function forbidden(): NextResponse {
  // Same `{ message }` envelope every client already parses.
  return NextResponse.json({ message: "This request could not be verified. Please reload the page and try again." }, { status: 403 });
}
