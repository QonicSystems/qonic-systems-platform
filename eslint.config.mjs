import { defineConfig, globalIgnores } from "eslint/config";
// eslint-config-next v16 ships native flat config, so it spreads directly —
// the FlatCompat wrapper the v15 eslintrc format needed is no longer required.
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  // lib/generated is Prisma's output — not ours to lint.
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "lib/generated/**"]),
]);
