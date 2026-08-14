import { describe, expect, it } from "vitest";
import { crossSiteRejection } from "@/lib/http/same-origin";

const headers = (values: Record<string, string>) => new Headers(values);

const PORTAL = "consulting.qonicsystems.com";

describe("crossSiteRejection — cross-site requests", () => {
  it("rejects a sibling subdomain on the same registrable domain", async () => {
    // The reason this check exists: SameSite=Lax treats these as same-site, so
    // the cookie rides along and the session cookie alone is no defence.
    const response = crossSiteRejection(headers({ origin: "https://shutterpact.qonicsystems.com", host: PORTAL }));
    expect(response?.status).toBe(403);
    expect(await response!.json()).toEqual({ message: expect.stringContaining("could not be verified") });
  });

  it.each([
    ["the apex", "https://qonicsystems.com"],
    ["an unrelated site", "https://evil.example"],
    ["a lookalike suffix", "https://consulting.qonicsystems.com.evil.example"],
    ["the same host on a different scheme+port", "http://consulting.qonicsystems.com:8080"],
  ])("rejects %s", (_label, origin) => {
    expect(crossSiteRejection(headers({ origin, host: PORTAL }))?.status).toBe(403);
  });

  it("rejects an unparseable Origin rather than letting it through", () => {
    expect(crossSiteRejection(headers({ origin: "not a url", host: PORTAL }))?.status).toBe(403);
  });
});

describe("crossSiteRejection — requests that must keep working", () => {
  it("allows a same-origin request", () => {
    expect(crossSiteRejection(headers({ origin: `https://${PORTAL}`, host: PORTAL }))).toBeNull();
  });

  it("allows localhost during development", () => {
    expect(crossSiteRejection(headers({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBeNull();
  });

  it("allows a Vercel preview deployment, which has no fixed hostname", () => {
    const host = "qonic-systems-platform-abc123-qonic.vercel.app";
    expect(crossSiteRejection(headers({ origin: `https://${host}`, host }))).toBeNull();
  });

  it("allows a request with no Origin at all", () => {
    // curl, server-to-server, and the test suite. Browsers always send Origin
    // on cross-origin state-changing requests, so absence is not the threat.
    expect(crossSiteRejection(headers({ host: PORTAL }))).toBeNull();
  });

  it("honours APP_ORIGIN for a deployment served under a second hostname", () => {
    const previous = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://staging.qonicsystems.com";
    try {
      expect(crossSiteRejection(headers({ origin: "https://staging.qonicsystems.com", host: PORTAL }))).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous;
    }
  });
});
