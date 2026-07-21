"use client";

import { useEffect, useState } from "react";

/**
 * The hero headline, typed out on load like a typewriter.
 *
 * The text is split into segments so the second phrase keeps its gold accent
 * (`.hero-accent`) as it appears. A hidden "ghost" copy of the full headline
 * reserves the final height, so the paragraph and buttons below never jump as
 * the text types in.
 *
 * Accessibility: the full phrase is exposed via aria-label and the ghost; the
 * animating layer is aria-hidden, so screen readers and crawlers get the whole
 * headline immediately.
 */
const SEGMENTS = [
  { text: "Connecting Talent. ", accent: false },
  { text: "Creating Tomorrow.", accent: true },
] as const;

const FULL = SEGMENTS.map((s) => s.text).join("");
const FIRST_LEN = SEGMENTS[0].text.length;
/** Start index of each segment within the full string (computed once). */
const OFFSETS = SEGMENTS.map((_, i) => SEGMENTS.slice(0, i).reduce((n, s) => n + s.text.length, 0));

export function TypingHeadline() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= FULL.length) return;
    const delay = shown < FIRST_LEN ? 60 : 45; // a touch quicker on the accent phrase
    const timer = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [shown]);

  const done = shown >= FULL.length;

  return (
    <h1 className="hero-in hero-typing" aria-label={FULL}>
      {/* Reserves the final height so nothing below shifts while typing. */}
      <span className="hero-typing-ghost" aria-hidden="true">
        Connecting Talent. <span className="hero-accent">Creating Tomorrow.</span>
      </span>
      {/* The animating layer, laid over the ghost. */}
      <span className="hero-typing-live" aria-hidden="true">
        {SEGMENTS.map((segment, index) => {
          const visible = segment.text.slice(0, Math.max(0, Math.min(segment.text.length, shown - OFFSETS[index])));
          if (!visible) return null;
          return segment.accent
            ? <span key={index} className="hero-accent">{visible}</span>
            : <span key={index}>{visible}</span>;
        })}
        <span className={`type-caret${done ? " type-caret--done" : ""}`} />
      </span>
    </h1>
  );
}
