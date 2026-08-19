import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { crossSiteRejection } from "@/lib/http/same-origin";
import { db } from "@/lib/db";
import { resolvePermissions } from "@/lib/auth/permissions";
import { ABSOLUTE_TTL_MS, IDLE_TTL_MS, REFRESH_AFTER_MS, SESSION_COOKIE, hashSessionToken, sessionCookieOptions } from "@/lib/auth/session";

export type AuthContext = {
  user: { id: string; name: string; email: string; phone: string | null; jobTitle: string | null; photoUrl: string | null; mustChangePassword: boolean; unreadNotificationCount: number };
  role: { id: string; key: string; label: string; isSuperAdmin: boolean; rank: number };
  permissions: ReadonlySet<string>;
  sessionId: string;
};

/**
 * Resolves the session cookie into a full auth context.
 *
 * Deliberately hits the database on every request rather than trusting a signed
 * token: the CEO can toggle a role's permissions at any moment and the change
 * must take effect on the very next request. `cache()` dedupes within a single
 * render — it is NOT a cross-request cache, which would reintroduce staleness.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          overrides: { include: { permission: true } },
          // Folded in here so the portal layout's unread badge doesn't cost a
          // second round trip on every page load — this query already runs on
          // every request regardless.
          _count: { select: { notifications: { where: { readAt: null } } } },
        },
      },
    },
  });

  if (!session) return null;

  const now = new Date();
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // A suspended or archived account loses access immediately, without needing
  // their sessions to be hunted down.
  if (session.user.status !== "ACTIVE") return null;

  const { user } = session;
  const enabled = user.role.permissions.filter((entry) => entry.enabled).map((entry) => entry.permission.key);
  const overrides = user.overrides.map((entry) => ({ permissionKey: entry.permission.key, effect: entry.effect, expiresAt: entry.expiresAt }));

  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, jobTitle: user.jobTitle, photoUrl: user.photoUrl, mustChangePassword: user.mustChangePassword, unreadNotificationCount: user._count.notifications },
    role: { id: user.role.id, key: user.role.key, label: user.role.label, isSuperAdmin: user.role.isSuperAdmin, rank: user.role.rank },
    permissions: resolvePermissions(user.role, enabled, overrides, now),
    sessionId: session.id,
  };
});

/** Slides the idle window forward, but never past the absolute cap. */
export async function touchSession(sessionId: string): Promise<void> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return;
  if (session.expiresAt.getTime() - (IDLE_TTL_MS - REFRESH_AFTER_MS) > Date.now()) return;

  const expiresAt = new Date(Math.min(Date.now() + IDLE_TTL_MS, session.absoluteExpiresAt.getTime()));
  await db.session.update({ where: { id: sessionId }, data: { expiresAt } });
  (await cookies()).set(SESSION_COOKIE, (await cookies()).get(SESSION_COOKIE)!.value, sessionCookieOptions(expiresAt));
}

export function can(context: AuthContext | null, permission: string): boolean {
  return Boolean(context?.permissions.has(permission));
}

/** For server components. Sends unauthenticated visitors to the login page. */
export async function requireAuth(nextPath?: string): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return context;
}

/** For server components. Renders the 403 boundary when the permission is absent. */
export async function requirePermission(permission: string, nextPath?: string): Promise<AuthContext> {
  const context = await requireAuth(nextPath);
  if (!can(context, permission)) redirect("/dashboard?denied=1");
  return context;
}

/**
 * For route handlers. Returns a ready-shaped response instead of throwing, and
 * keeps 401 distinct from 403 so the client can redirect vs. simply report.
 * Response shape matches app/api/contact/route.ts: `{ message }`.
 */
export async function guardRoute(
  permission?: string,
): Promise<{ context: AuthContext; response?: never } | { context?: never; response: NextResponse }> {
  // Every protected route funnels through here, so this is the one place a
  // CSRF check covers all of them. Read from next/headers rather than taking a
  // Request parameter: getAuthContext() already calls cookies(), so a request
  // scope is a precondition of this function either way, and threading a new
  // argument through ~40 call sites would be easy to miss one of.
  const crossSite = crossSiteRejection(await headers());
  if (crossSite) return { response: crossSite };

  const context = await getAuthContext();
  if (!context) return { response: NextResponse.json({ message: "Please sign in to continue." }, { status: 401 }) };
  if (permission && !can(context, permission)) {
    return { response: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 }) };
  }
  return { context };
}

export const SESSION_TTL = { IDLE_TTL_MS, ABSOLUTE_TTL_MS };
