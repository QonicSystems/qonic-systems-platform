import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0F1419", soft: "#2A313B", muted: "#565F6B", faint: "#8A93A0" },
        canvas: { DEFAULT: "#FCFBF9", sub: "#F5F3EF", line: "#E9E5DE" },
        accent: { DEFAULT: "#0E9384", deep: "#0B6E63", dark: "#07504A", tint: "#EDF8F5", soft: "#CFEBE4" },
        sand: { DEFAULT: "#C2A878", tint: "#F7F1E6" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
