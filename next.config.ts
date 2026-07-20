import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in a parent directory makes Next infer the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: import.meta.dirname,
  // Native binary — must not be bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  // Hides the floating dev-tools badge, which overlapped the hero CTA on small screens.
  // Dev-only UI — it never shipped in production builds.
  devIndicators: false,
};

export default nextConfig;
