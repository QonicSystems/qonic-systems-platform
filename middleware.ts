import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Optimistic gate only — NOT the security boundary.
 *
 * Middleware runs on the Edge runtime, where Prisma and argon2 are unavailable,
 * so it cannot validate the session. It only checks that a cookie is present to
 * avoid rendering a portal page for an obviously signed-out visitor. A forged
 * cookie gets past this and is then rejected by lib/auth/guard.ts, which does
 * the real check against the database on every request.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)) {
    // Server layouts cannot read the pathname, and the portal layout needs it to
    // apply the "must change password" gate without redirecting in a loop.
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/profile/:path*", "/directory/:path*", "/contracts/:path*", "/leave/:path*"],
};
