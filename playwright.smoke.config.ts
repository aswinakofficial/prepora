import { defineConfig } from "@playwright/test";

// Read-only smoke tests against a deployed site (docs/specs/16-engineering-team.md, decisions 5 and
// 7): after every release, and hourly. They only look: no sign-in, no answers submitted, nothing
// written. SMOKE_BASE_URL defaults to production.
//
//   pnpm exec playwright test -c playwright.smoke.config.ts
export default defineConfig({
  testDir: "./tests/smoke",
  workers: 2,
  retries: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://prepora.xpar.in",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
