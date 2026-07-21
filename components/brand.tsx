import { LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/brand-art";
import { site } from "@/lib/site";

/**
 * The QONIC mark — the supplied artwork verbatim.
 *
 * Geometry comes from lib/brand-art.ts, shared with the PDF letterheads so the
 * web and every issued document draw the identical mark. The fill is bound to
 * the brand token so a palette change stays in one place.
 *
 * The mark is static — deliberately not animated.
 */
export function LogoMark() {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${site.name} mark`}
      className="qonic-mark"
    >
      {LOGO_PATHS.map((d) => <path key={d} d={d} fill={site.brand.mark} />)}
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
