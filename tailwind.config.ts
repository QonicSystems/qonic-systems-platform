import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1D3A", light: "#122B52", dark: "#061224" },
        teal: { DEFAULT: "#14B8A6", deep: "#0F766E", light: "#CCFBF1", tint: "#F0FDFA" },
        slate: { heading: "#1E293B", body: "#475569", muted: "#94A3B8" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
