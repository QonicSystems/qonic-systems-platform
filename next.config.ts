import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in a parent directory makes Next infer the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: import.meta.dirname,
  // Turbopack infers its own root the same way, and getting it wrong makes it
  // resolve `next` from the parent and panic. Pin it too.
  turbopack: { root: import.meta.dirname },
  // Native binary — must not be bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  // Signatures are read from disk at render time, so the tracer cannot see them
  // as imports. Without this the files are dropped from a standalone build and
  // documents silently lose their signature block.
  outputFileTracingIncludes: {
    "/api/contracts/[id]/pdf": ["./assets/signatures/**"],
  },
  // Hides the floating dev-tools badge, which overlapped the hero CTA on small screens.
  // Dev-only UI — it never shipped in production builds.
  devIndicators: false,
  /**
   * Security headers. HSTS is deliberately absent — Vercel and Caddy both set
   * it at the edge, and a second value here would only risk disagreeing.
   *
   * `frame-ancestors 'none'` is the load-bearing one: without it the portal can
   * be framed, and an authenticated CEO can be UI-redressed into clicking
   * "Deactivate" or confirming an audit purge.
   *
   * Note this is NOT a full CSP. A real `default-src 'self'` policy needs
   * nonces for Next's inline bootstrap scripts, plus allowances for the
   * reCAPTCHA script and frame — that belongs in its own change with its own
   * verification, not bundled into a security fix that must ship today.
   */
  /**
   * `/reports` was the Utilisation report and the index of the Reports group.
   * Both are gone; Revenue is the only report left and now lives under Finance.
   * Redirecting rather than moving the page keeps `/reports/revenue` — the URL
   * in bookmarks, docs and tests/redirect-safety.test.ts — stable.
   *
   * 307, not 308: a permanent redirect is cached by the browser forever, and a
   * real `/reports` index could legitimately return later.
   */
  async redirects() {
    return [{ source: "/reports", destination: "/reports/revenue", permanent: false }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
      ],
    }];
  },
};

export default nextConfig;
