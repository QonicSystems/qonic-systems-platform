import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Umbrella routing for the three Qonic hostnames, plus the portal's session gate.
 *
 * On the VPS this split is Caddy's job (see deploy/Caddyfile). Vercel has no
 * equivalent: every domain attached to a project hits the same deployment, so
 * the hostname has to be read here instead. The two sibling sites are plain
 * static files under public/ — the same files Caddy serves — and are reached by
 * rewriting to them.
 */
const PORTAL_PREFIXES = [
  "/dashboard",
  "/admin",
  "/profile",
  "/directory",
  "/contracts",
  "/leave",
  "/timesheets",
  "/projects",
  "/clients",
  "/reports",
  "/jobs",
  "/candidates",
  "/invoices",
  "/expenses",
  "/notifications",
];

type Site = "landing" | "shutterpact" | "app";

/**
 * Hostnames that serve the two static sibling sites, matched in full.
 *
 * This was previously decided on the first label alone, which was neater but
 * unsafe: `staticSite` below fetches an origin derived from the request, so a
 * Host of `qonicsystems.attacker.example` also matched "qonicsystems" and would
 * have made the Edge function fetch the attacker's server and return its HTML
 * from our own origin. Vercel only routes attached domains and deploy/Caddyfile
 * matches explicit hostnames, so that was never reachable in production — but
 * an exact allowlist removes the class of bug rather than relying on the layer
 * in front. A new hostname now needs a line here, which is the intended
 * trade-off.
 */
const LANDING_HOSTS = new Set(["qonicsystems.com", "www.qonicsystems.com", "qonicsystems.localhost", "www.qonicsystems.localhost"]);
const SHUTTERPACT_HOSTS = new Set(["shutterpact.qonicsystems.com", "shutterpact.qonicsystems.localhost"]);

/**
 * Anything unrecognised — localhost, 127.0.0.1, *.vercel.app preview URLs — is
 * the app, so `next dev` and the e2e suite keep reaching the portal directly.
 */
function siteFor(host: string): Site {
  const name = host.split(":")[0].toLowerCase();
  if (SHUTTERPACT_HOSTS.has(name)) return "shutterpact";
  if (LANDING_HOSTS.has(name)) return "landing";
  return "app";
}

/**
 * Serve a static sibling site.
 *
 * The "this page is an error" pages are fetched and re-sent rather than
 * rewritten, because a rewrite cannot carry a status — and 404-with-200 on the
 * parent domain is a soft 404, while Shutterpact's whole point is that it is
 * honestly 503 until it launches (the same reasoning as deploy/Caddyfile).
 */
async function staticSite(site: Exclude<Site, "app">, request: NextRequest) {
  const { pathname } = request.nextUrl;
  const at = (file: string) => new URL(file, request.url);

  if (site === "shutterpact") {
    if (pathname === "/favicon.svg") return NextResponse.rewrite(at("/shutterpact/favicon.svg"));
    return withStatus(at("/shutterpact/index.html"), 503, { "retry-after": "3600" });
  }

  if (pathname === "/") return NextResponse.rewrite(at("/landing/index.html"));
  if (pathname === "/favicon.svg") return NextResponse.rewrite(at("/landing/favicon.svg"));
  return withStatus(at("/landing/404.html"), 404);
}

async function withStatus(url: URL, status: number, headers: Record<string, string> = {}) {
  const page = await fetch(url);
  return new NextResponse(page.body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The fetch above re-enters middleware; let the real files through, or it loops.
  if (pathname.startsWith("/landing/") || pathname.startsWith("/shutterpact/")) {
    return NextResponse.next();
  }

  const site = siteFor(request.headers.get("host") ?? "");
  if (site !== "app") return staticSite(site, request);

  const isPortal = PORTAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPortal) return NextResponse.next();

  /*
   * Optimistic gate only — NOT the security boundary.
   *
   * Middleware runs on the Edge runtime, where Prisma and argon2 are unavailable,
   * so it cannot validate the session. It only checks that a cookie is present to
   * avoid rendering a portal page for an obviously signed-out visitor. A forged
   * cookie gets past this and is then rejected by lib/auth/guard.ts, which does
   * the real check against the database on every request.
   */
  if (request.cookies.get(SESSION_COOKIE)) {
    // Server layouts cannot read the pathname, and the portal layout needs it to
    // apply the "must change password" gate without redirecting in a loop.
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the API, which are only ever the
  // app's and must not be routed by hostname.
  matcher: ["/((?!_next/|api/).*)"],
};
