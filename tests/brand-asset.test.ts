import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { site } from "@/lib/site";

/**
 * public/brand/logo.svg is the canonical artwork. components/brand.tsx repeats
 * its path data inline, because an <img> cannot animate individual faces or
 * bind its fills to the CSS tokens — both of which the lockup needs.
 *
 * That duplication is the risk these tests exist to remove: if someone replaces
 * the asset with new artwork and forgets the component (or the reverse), the
 * favicon and the header would silently show different logos. Comparing the two
 * makes that a failing test rather than a thing nobody notices for months.
 */
const root = join(__dirname, "..");
const asset = readFileSync(join(root, "public/brand/logo.svg"), "utf8");
const component = readFileSync(join(root, "components/brand.tsx"), "utf8");

const pathData = (source: string) => [...source.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);

describe("brand artwork", () => {
  it("keeps the inline mark identical to the stored asset", () => {
    const assetPaths = pathData(asset);
    expect(assetPaths).toHaveLength(3);
    expect(pathData(component)).toEqual(assetPaths);
  });

  it("keeps the inline viewBox identical to the stored asset", () => {
    const viewBox = (source: string) => source.match(/viewBox="([^"]+)"/)?.[1];
    expect(viewBox(component)).toBe(viewBox(asset));
  });

  it("uses the asset's own fill colour as the brand token", () => {
    const fills = new Set([...asset.matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toLowerCase()));
    // The artwork is a single flat colour; that colour is what site.brand.mark
    // must carry, since every yellow on the site derives from it.
    expect(fills.size).toBe(1);
    expect([...fills][0]).toBe(site.brand.mark.toLowerCase());
  });
});
