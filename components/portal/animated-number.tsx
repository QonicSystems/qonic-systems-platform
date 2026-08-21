"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

/** Ease-out cubic — starts fast, settles gently onto the final value. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Counts up from 0 to `value` (minor units) on mount, then holds exactly on
 * the real figure — never a rounding artifact, since the last animation
 * frame always snaps to the literal prop rather than an interpolated
 * approximation. Skips straight to the final value under prefers-reduced-motion.
 *
 * Takes a plain `currency` string rather than a formatter function: a
 * Server Component can't pass a function prop across to a Client Component
 * (it isn't serializable), so the formatting has to live in here instead.
 */
export function AnimatedNumber({ value, currency = "INR", durationMs = 900 }: {
  value: number;
  currency?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame: number;
    // setState only ever runs from inside this rAF callback (never directly
    // in the effect body) — reduced motion just resolves on the first frame
    // instead of animating across `durationMs`.
    const tick = (now: number) => {
      const t = reduceMotion ? 1 : Math.min(1, (now - start) / durationMs);
      setDisplay(t >= 1 ? value : Math.round(value * easeOutCubic(t))); // Snap to the exact figure on the last frame — never left at a rounded interpolation.
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span aria-label={formatMoney(value, currency)}>{formatMoney(display, currency)}</span>;
}
