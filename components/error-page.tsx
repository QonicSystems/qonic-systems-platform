"use client";

import Link from "next/link";

/**
 * A shared, brand-themed (yellow-on-black) error page with a funny message per
 * HTTP status code. Used by not-found, the error boundary, and global-error.
 */
type Content = { title: string; quip: string };

const MESSAGES: Record<number, Content> = {
  400: { title: "That made no sense.", quip: "We read your request three times and it's still gibberish. Even the intern shrugged. Try rephrasing?" },
  401: { title: "Who goes there?", quip: "We don't know you yet. Sign in and we'll roll out the yellow carpet." },
  403: { title: "Nope. Not for you.", quip: "This door is bolted shut. You'd need a keycard, a secret handshake, and a note from the CEO." },
  404: { title: "Well, this is awkward.", quip: "This page pulled a disappearing act worthy of a magician. We even checked behind the sofa. Nothing." },
  418: { title: "I'm a teapot.", quip: "You asked me to brew coffee. I am, and shall remain, short and stout. It's the law." },
  429: { title: "Whoa there, speedster.", quip: "You're clicking faster than we can keep up. Take a breath, we'll still be here." },
  500: { title: "We broke it. Not you.", quip: "Something went bang on our end. The engineers have been notified — loudly. Please try again shortly." },
  503: { title: "Back in a jiffy.", quip: "We're catching our breath. Grab a coffee and give it another go in a moment." },
};

const DEFAULT: Content = { title: "Something went sideways.", quip: "That wasn't supposed to happen. Let's get you back to safety." };

export function ErrorPage({ code = 404, reset, homeHref = "/" }: { code?: number; reset?: () => void; homeHref?: string }) {
  const { title, quip } = MESSAGES[code] ?? DEFAULT;

  return (
    <main className="err-page">
      <div className="err-glow" aria-hidden="true" />
      <p className="err-tag">Error {code}</p>
      <div className="err-code" aria-hidden="true">{code}</div>
      <h1 className="err-title">{title}</h1>
      <p className="err-quip">{quip}</p>
      <div className="err-actions">
        {reset ? <button type="button" className="err-btn err-btn--solid" onClick={reset}>Try again</button> : null}
        <Link href={homeHref} className="err-btn err-btn--ghost">Take me home</Link>
      </div>
    </main>
  );
}
