import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// The portal needs a database, and the webServer previously inherited no env at
// all — every authenticated page would have failed to render.
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3008", trace: "on-first-retry" },
  // Runs a PRODUCTION build rather than `next dev`. Two reasons: it exercises
  // what actually ships, and the Turbopack dev server intermittently serves a
  // 500 when a page is requested while its RSC manifest is still being written
  // — a race that made marketing pages flaky, unrelated to the app code.
  webServer: {
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3008",
    url: "http://127.0.0.1:3008",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATABASE_URL: databaseUrl ?? "" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
