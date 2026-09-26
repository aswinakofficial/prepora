import { defineConfig } from "@playwright/test";

// CI does not run these yet (see docs/roadmap/engineering-roadmap.md item 9's own scope: lint,
// typecheck, unit tests and drizzle-kit check only, kept under five minutes) — this config exists so
// `pnpm test:e2e` works locally once tests/e2e gains its first spec.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter @prepora/web dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
