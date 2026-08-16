import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mirrors the :root tokens in globals.css, both derived from the logo.
        ink: { DEFAULT: "#111111", soft: "#2B2B2B", muted: "#4F4F4F", faint: "#8A8A8A", subtle: "#64748B" },
        canvas: { DEFAULT: "#FFFFFF", sub: "#F8F7F3", line: "#E7E4DA", muted: "#F1EFEA" },
        // accent.DEFAULT is the brand yellow — fills only. Use deep/dark for text.
        accent: {
          DEFAULT: "#FFD700",
          hover: "#ECC500",
          deep: "#8A6A08",
          dark: "#6B5206",
          tint: "#FFF9DD",
          soft: "#FFE98A",
          muted: "rgba(255, 215, 0, 0.15)",
        },
        navy: { DEFAULT: "#111111", soft: "#2B2B2B", tint: "#F3F2EE" },
        surface: {
          card: "rgba(255, 255, 255, 0.95)",
          frosted: "rgba(255, 255, 255, 0.82)",
          subtle: "rgba(15, 23, 42, 0.03)",
        },
      },
      boxShadow: {
        "xs": "0 1px 2px 0 rgba(17, 17, 17, 0.04)",
        "sm": "0 1px 3px 0 rgba(17, 17, 17, 0.06), 0 1px 2px -1px rgba(17, 17, 17, 0.06)",
        "md": "0 4px 12px -2px rgba(17, 17, 17, 0.08), 0 2px 6px -2px rgba(17, 17, 17, 0.04)",
        "lg": "0 12px 28px -6px rgba(17, 17, 17, 0.12), 0 4px 10px -2px rgba(17, 17, 17, 0.04)",
        "xl": "0 20px 40px -12px rgba(17, 17, 17, 0.16)",
        "glow": "0 0 24px -4px rgba(255, 215, 0, 0.35)",
        "inner-border": "inset 0 0 0 1px rgba(17, 17, 17, 0.06)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "xl": "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;

