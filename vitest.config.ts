import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Vitest does not read tsconfig paths, so the "@" alias is re-declared here.
const alias = { "@": fileURLToPath(new URL("./", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // Pure logic and route handlers. Kept on the node environment so the
        // bulk of the suite stays fast.
        resolve: { alias },
        test: { name: "unit", environment: "node", include: ["tests/**/*.test.ts"] },
      },
      {
        // React components. Before this project existed no component in the
        // codebase was unit-testable at all.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
        },
      },
    ],
  },
});
