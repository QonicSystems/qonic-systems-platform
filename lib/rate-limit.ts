import { NextResponse } from "next/server";
import { clientIp } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Fixed-window per-IP throttling for the public endpoints.
 *
 * The login lockout in app/api/auth/login/route.ts counts failures per ACCOUNT,
 * which stops one account being brute-forced but does nothing about the two
 * attacks that actually matter here: spraying one password across every account
 * from a single host, and deliberately locking a known account out (8 requests
 * buys 15 minutes; a loop keeps the CEO out indefinitely). Both are per-caller
 * problems, so they need a per-caller counter.
 *
 * Fixed windows, not a sliding log: a burst can straddle a boundary and get up
 * to 2x the limit, which is an acceptable trade for one indexed upsert per
 * request instead of a row per request.
 */
export type Bucket = { name: string; limit: number; windowMs: number };

export const BUCKETS = {
  /** Generous enough for a person mistyping a password, useless for spraying. */
  login: { name: "login", limit: 10, windowMs: 10 * 60 * 1000 },
  /** Each one sends mail from our SMTP account. */
  contact: { name: "contact", limit: 5, windowMs: 60 * 60 * 1000 },
  /** Each one mails a real user and invalidates their previous link. */
  forgotPassword: { name: "forgot-password", limit: 5, windowMs: 60 * 60 * 1000 },
  /** Each one writes candidate + application + event rows. */
  apply: { name: "apply", limit: 10, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, Bucket>;

/** Shared wording — never says which limit was hit or how much is left. */
const MESSAGE = "Too many requests. Please wait a few minutes and try again.";

/**
 * Returns a 429 once the caller is over the limit for this bucket, otherwise
 * null. Fails OPEN: if the counter itself errors we let the request through
 * rather than taking the site down over a throttling table.
 */
export async function rateLimitRejection(bucket: Bucket, request: Request): Promise<NextResponse | null> {
  const ip = clientIp(request);
  // No usable client address means we cannot attribute the request to anyone.
  // Blocking everyone who lacks one would take out the whole endpoint, so this
  // degrades to the per-account controls that already exist.
  if (!ip) return null;

  const key = `${bucket.name}:${ip}`;
  const windowStart = new Date(Math.floor(Date.now() / bucket.windowMs) * bucket.windowMs);

  try {
    const row = await db.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    if (row.count > bucket.limit) {
      const retryAfter = Math.ceil((windowStart.getTime() + bucket.windowMs - Date.now()) / 1000);
      return NextResponse.json({ message: MESSAGE }, { status: 429, headers: { "retry-after": String(Math.max(retryAfter, 1)) } });
    }

    // Opportunistic sweep, roughly 1 request in 50, so old windows do not
    // accumulate and no cron job is needed for a table this small.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => undefined);
    }

    return null;
  } catch (error) {
    console.error("Rate limit check failed", error);
    return null;
  }
}
