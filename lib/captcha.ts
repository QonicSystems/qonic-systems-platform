import { NextResponse } from "next/server";

/**
 * Google reCAPTCHA v3 verification for the public forms.
 *
 * v3 is invisible and score-based: the browser produces a token on submit, and
 * Google returns a 0.0-1.0 score for how human the interaction looked. There is
 * no puzzle and nothing for a legitimate visitor to do.
 *
 * Deliberately a no-op when RECAPTCHA_SECRET_KEY is unset, so local development
 * and the test suite work without keys. That means forgetting the key in
 * production silently disables the protection — the trade is intentional
 * (breaking the contact form for a missing optional key is worse), and
 * `captchaConfigured()` exists so a health check can assert it.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** Below this, treat the caller as a bot. Google's own suggested default. */
const SCORE_THRESHOLD = 0.5;

/** Actions must match what the client passes to grecaptcha.execute(). */
export type CaptchaAction = "contact" | "apply" | "forgot_password";

export function captchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

type VerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
};

/**
 * Returns a ready-shaped rejection, or null to continue — the same
 * `{ response } | null` idiom as lib/http/same-origin.ts, so a handler reads as
 * a short list of guards before any work happens.
 */
export async function captchaRejection(action: CaptchaAction, token: unknown): Promise<NextResponse | null> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return null;

  if (typeof token !== "string" || !token) return failed();

  let result: VerifyResponse;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      // Google being slow must not hold a form submission open indefinitely.
      signal: AbortSignal.timeout(5000),
    });
    result = await response.json() as VerifyResponse;
  } catch (error) {
    // Fail OPEN on an outage: a legitimate applicant should not lose their
    // application because Google was unreachable. The rate limiter is the
    // control that still holds in that window.
    console.error("reCAPTCHA verification unreachable", error);
    return null;
  }

  if (!result.success) return failed();
  // A token minted for a different form must not be replayed here.
  if (result.action && result.action !== action) return failed();
  if (typeof result.score === "number" && result.score < SCORE_THRESHOLD) return failed();

  return null;
}

function failed(): NextResponse {
  // Same `{ message }` envelope as every other public response. Says nothing
  // about scores or thresholds, which would only help tune an attack.
  return NextResponse.json({ message: "We could not verify that you are human. Please reload the page and try again." }, { status: 400 });
}
