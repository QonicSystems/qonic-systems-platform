import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mirrors the :root tokens in globals.css, both derived from the logo.
        ink: { DEFAULT: "#111111", soft: "#2B2B2B", muted: "#4F4F4F", faint: "#8A8A8A" },
        canvas: { DEFAULT: "#FFFFFF", sub: "#F8F7F3", line: "#E7E4DA" },
        // accent.DEFAULT is the brand yellow — fills only. Use deep/dark for text.
        accent: { DEFAULT: "#FFD700", deep: "#8A6A08", dark: "#6B5206", tint: "#FFF9DD", soft: "#FFE98A" },
        navy: { DEFAULT: "#111111", soft: "#2B2B2B", tint: "#F3F2EE" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
