import { site } from "@/lib/site";

/**
 * The QONIC mark — the supplied artwork verbatim.
 *
 * The three paths and the 0 0 80 79.8 viewBox are exactly as provided; nothing
 * has been redrawn. Only the fills are bound to the brand tokens so a palette
 * change stays in one place, and the paths carry classes so the sweep can
 * animate them.
 *
 * Path 1 — outer chevron (the large forward arrow)
 * Path 2 — inner chevron, nested behind it
 * Path 3 — the small accent notch
 */
export function LogoMark({ animated = true }: { animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 80 79.8"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${site.name} mark`}
      className={animated ? "qonic-mark is-animated" : "qonic-mark"}
    >
      <path
        className="qonic-chevron qonic-chevron--front"
        d="M40.14 79.8a2.66 2.66 0 0 1-2-1.07c-1.58-1.61-3.14-3.33-4.84-4.82-2-1.72-1.77-3 0-4.8 9-8.88 17.85-18 27-26.75 2.43-2.36 2.29-3.67-.06-6-9-8.74-17.75-17.74-26.71-26.53-1.94-1.91-1.92-3.12 0-5 6.45-6.43 6.38-6.5 12.87 0C57 15.48 67.63 26.17 78.37 36.72c2.14 2.1 2.2 3.39 0 5.53C66.41 54 54.58 66 42.69 77.83a5.82 5.82 0 0 1-2.55 1.97z"
        fill={site.brand.mark}
      />
      <path
        className="qonic-chevron qonic-chevron--back"
        d="M23.3 16a4 4 0 0 1 2.15 1.4c6.63 6.6 13.23 13.26 19.92 19.82 1.65 1.62 1.52 2.83 0 4.36q-10 9.89-19.9 19.87c-1.64 1.65-2.93 1.62-4.66 0-7-6.67-7-6.62-.35-13.32 2.24-2.23 4.42-4.52 6.73-6.68 1.66-1.56 1.56-2.83 0-4.38-3.6-3.48-7.06-7.11-10.67-10.59-1.69-1.63-1.89-2.92 0-4.54 1.74-1.48 3.27-3.21 4.9-4.81A3 3 0 0 1 23.3 16z"
        fill={site.brand.mark}
      />
      <path
        className="qonic-spark"
        d="M12.8 39.51a19.94 19.94 0 0 1-5.8 6c-1.71 1.16-2.69-.79-3.71-1.77-4.38-4.23-4.36-4.25-.08-8.39 3-2.88 3.28-2.91 6.24.12 1.19 1.17 2.74 2.12 3.35 4.04z"
        fill={site.brand.accent}
      />
    </svg>
  );
}

/**
 * Full lockup: mark, wordmark, and the rule-flanked tagline.
 *
 * `stacked` is the large treatment (login, footer); the compact form drops the
 * tagline, which is unreadable at header size.
 */
export function BrandLockup({ stacked = false, animated = true }: { stacked?: boolean; animated?: boolean }) {
  return (
    <span className={`qonic-lockup ${stacked ? "qonic-lockup--stacked" : "qonic-lockup--compact"}`}>
      <span className="qonic-markwrap"><LogoMark animated={animated} /></span>
      <span className="qonic-words">
        <span className="qonic-wordmark">
          <strong>QONIC</strong> <span>consulting</span>
        </span>
        {stacked && <span className="qonic-tagline"><i />{site.tagline}<i /></span>}
      </span>
    </span>
  );
}
