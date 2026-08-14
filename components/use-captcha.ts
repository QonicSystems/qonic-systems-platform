"use client";

import { useCallback, useEffect } from "react";

/**
 * Loads reCAPTCHA v3 on demand and mints a token per submission.
 *
 * The script is injected by the first form that mounts rather than from the
 * root layout, so pages with no form never pay for it and no third-party script
 * runs on the portal at all.
 *
 * Returns "" when the key is absent, the script fails, or Google is slow. The
 * server treats a missing token the same way it treats a missing secret — as
 * "captcha not in play" — so an outage degrades to the rate limiter rather than
 * locking legitimate people out of the contact form.
 */
const SCRIPT_ID = "recaptcha-v3";
/** Past this, stop waiting for Google and submit without a token. */
const READY_TIMEOUT_MS = 4000;

type Grecaptcha = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window { grecaptcha?: Grecaptcha }
}

export function useCaptcha(action: string) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  useEffect(() => {
    // No state here on purpose: readiness is read from `window` at submit time,
    // so the effect only ever has the side effect of adding the script tag.
    if (!siteKey || window.grecaptcha || document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    document.head.appendChild(script);
  }, [siteKey]);

  return useCallback(async (): Promise<string> => {
    if (!siteKey) return "";

    // Submitting before the script finished loading is normal — someone can
    // fill a short form faster than a third-party script loads — so wait
    // briefly rather than giving up immediately.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!window.grecaptcha && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) return "";

    try {
      return await new Promise<string>((resolve) => {
        grecaptcha.ready(() => {
          grecaptcha.execute(siteKey, { action }).then(resolve).catch(() => resolve(""));
        });
      });
    } catch {
      return "";
    }
  }, [siteKey, action]);
}
