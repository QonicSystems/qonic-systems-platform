import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mirrors the :root tokens in globals.css, both derived from the logo.
        ink: { DEFAULT: "#09142E", soft: "#1D2B47", muted: "#4C5A72", faint: "#8B96A9" },
        canvas: { DEFAULT: "#FFFFFF", sub: "#F4F6FA", line: "#E2E7F0" },
        accent: { DEFAULT: "#E84218", deep: "#C53410", dark: "#9C2809", tint: "#FDF0EB", soft: "#F8CCBD" },
        navy: { DEFAULT: "#09142E", soft: "#16244A", tint: "#EEF1F7" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
