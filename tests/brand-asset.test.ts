import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/brand-art";
import { signatureFor } from "@/lib/signatures";
import { site } from "@/lib/site";

/**
 * public/brand/logo.svg is the canonical artwork — it is also the favicon.
 * lib/brand-art.ts repeats its geometry, because neither React nor @react-pdf
 * can draw an .svg file as vector paths with token-driven fills.
 *
 * That duplication is the risk these tests exist to remove. Replace the artwork
 * and forget the module (or the reverse) and the site, the favicon, and every
 * issued document quietly disagree about what the logo is. These tests turn
 * that into a build failure instead of something nobody notices for months.
 *
 * They also pin down where signature images may live — see lib/signatures.ts.
 */
const root = join(__dirname, "..");
const asset = readFileSync(join(root, "public/brand/logo.svg"), "utf8");

const pathData = (source: string) => [...source.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);

describe("brand artwork", () => {
  it("keeps the shared geometry identical to the stored asset", () => {
    const assetPaths = pathData(asset);
    expect(assetPaths).toHaveLength(3);
    expect([...LOGO_PATHS]).toEqual(assetPaths);
  });

  it("keeps the shared viewBox identical to the stored asset", () => {
    expect(LOGO_VIEWBOX).toBe(asset.match(/viewBox="([^"]+)"/)?.[1]);
  });

  it("draws the same mark on the web and on both document letterheads", () => {
    // Each of these must go through lib/brand-art rather than its own copy,
    // which is what keeps a letter's logo identical to the site's.
    for (const file of ["components/brand.tsx", "lib/pdf-brand.tsx"]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} should import the shared mark`).toContain("@/lib/brand-art");
      expect(pathData(source), `${file} should not inline its own path data`).toEqual([]);
    }
    // Both documents must go through the one shared letterhead rather than
    // rolling their own — that divergence is what left the letter's wordmark
    // half grey while the site's was black.
    for (const doc of ["lib/contracts/pdf.tsx", "lib/finance/invoice-pdf.tsx"]) {
      const source = readFileSync(join(root, doc), "utf8");
      expect(source, `${doc} should render the shared letterhead`).toContain("<PdfLockup />");
      expect(pathData(source), `${doc} should not inline its own path data`).toEqual([]);
    }
  });

  it("uses the asset's own fill colour as the brand token", () => {
    const fills = new Set([...asset.matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toLowerCase()));
    // The artwork is a single flat colour; that colour is what site.brand.mark
    // must carry, since every yellow on the site derives from it.
    expect(fills.size).toBe(1);
    expect([...fills][0]).toBe(site.brand.mark.toLowerCase());
  });

  it("has a signature on file for the CEO and nobody else by default", () => {
    const ceo = signatureFor("founder@qonic.com");
    expect(ceo).not.toBeNull();
    expect(ceo!.byteLength).toBeGreaterThan(1000);
    // Case must not matter — emails are compared case-insensitively elsewhere.
    expect(signatureFor("Founder@QONIC.com")).not.toBeNull();
    // Nobody else gets one, so no document can show a borrowed signature.
    expect(signatureFor("hr@qonic.com")).toBeNull();
    expect(signatureFor(null)).toBeNull();
  });

  it("keeps signatures out of the publicly served directory", () => {
    // public/ is served with no auth check; a signature there is downloadable
    // by anyone who guesses the filename.
    expect(() => readFileSync(join(root, "public/signatures/founder.png"))).toThrow();
    expect(() => readFileSync(join(root, "public/brand/founder.png"))).toThrow();
  });
});
