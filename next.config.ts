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
};

export default nextConfig;
