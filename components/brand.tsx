import { site } from "@/lib/site";

/**
 * The QONIC mark — the supplied artwork verbatim.
 *
 * The three paths and the 0 0 181.17 191.19 viewBox are exactly as provided;
 * nothing has been redrawn. Only the fills are bound to the brand token so a
 * palette change stays in one place. The mark is static — deliberately not
 * animated.
 *
 * Path 1 — the right face of the cube
 * Path 2 — the left face, the large body of the mark
 * Path 3 — the small detached shard at the lower left
 */
export function LogoMark() {
  return (
    <svg
      viewBox="0 0 181.17 191.19"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${site.name} mark`}
      className="qonic-mark"
    >
      <path
        d="M40.36 27.65C56.27 18.57 71.69 9.76 87.13 1a7.35 7.35 0 0 1 7.73.25q42.28 24.25 84.55 48.56a4.08 4.08 0 0 1 1.69 3c.08 32.3.13 64.61-.09 96.91a8.34 8.34 0 0 1-3.35 6.13c-15.19 9-30.59 17.63-45.94 26.36-.15.09-.41 0-1.05 0v-3.73c0-31.65 0-63.3.07-94.95 0-3-.84-4.6-3.46-6.08q-42.39-24-84.67-48.33c-.61-.35-1.23-.79-2.25-1.47z"
        fill={site.brand.mark}
      />
      <path
        d="M65.48 191.19v-3.93c0-22.22-.06-44.44.07-66.66 0-2.91-1-4.39-3.42-5.78C42.5 103.75 23 92.54 3.39 81.37c-.93-.53-1.85-1.09-3.39-2 .67-.32 1.06-.47 1.43-.68C14.3 71.29 27.22 64 40 56.47c3.79-2.22 7.06-2.24 10.9 0Q79.45 73 108.18 89.2a4.53 4.53 0 0 1 2.71 4.53q-.14 33.33 0 66.66c0 3.34-1.08 5.89-4 7.57L67.3 190.47a19.1 19.1 0 0 1-1.82.72z"
        fill={site.brand.mark}
      />
      <path
        d="M45.43 128.11V180L.05 154z"
        fill={site.brand.mark}
      />
    </svg>
  );
}

/**
 * Full lockup: QONIC · mark · consulting, with the rule-flanked tagline beneath.
 *
 * The mark sits BETWEEN the two words, exactly as in the artwork — it is part of
 * the wordmark's baseline, not a separate badge alongside it.
 *
 * `stacked` is the large treatment (login, footer); the compact form drops the
 * tagline, which is unreadable at header size.
 */
export function BrandLockup({ stacked = false }: { stacked?: boolean }) {
  return (
    <span className={`qonic-lockup ${stacked ? "qonic-lockup--stacked" : "qonic-lockup--compact"}`}>
      <span className="qonic-wordmark">
        <strong>QONIC</strong>
        <span className="qonic-markwrap"><LogoMark /></span>
        <span className="qonic-word-soft">consulting</span>
      </span>
      {stacked && <span className="qonic-tagline"><i />{site.tagline}<i /></span>}
    </span>
  );
}
