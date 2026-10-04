import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_BASE_URL } from "./tests/e2e/helpers/env";

// End-to-end acceptance tests (tests/e2e) — the UI checks every spec's "Deliverable and UI
// acceptance" section is written as (CLAUDE.md → Working agreements → Testing). They run in CI on
// every PR, and locally with:
//
//   E2E_DATABASE_URL=$(bash scripts/dev-db.sh url) pnpm test:e2e
//
// Safety: the tests seed and delete rows directly, and the root .env points at production. So
// this config never reads .env: it takes the database only from E2E_DATABASE_URL, refuses anything
// that isn't a local database, and starts its own web app (port 3100) and pipeline service (port
// 8101) against that database — never the dev servers you may have running on 3000/8001.

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL is required: a LOCAL database, e.g. $(bash scripts/dev-db.sh url). " +
      "The e2e tests write to it; they never use .env's DATABASE_URL.",
  );
}
const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  throw new Error(`E2E_DATABASE_URL must point at a local database, not ${host}.`);
}
// The test process itself seeds through @prepora/db's getDb(), which reads DATABASE_URL.
process.env.DATABASE_URL = databaseUrl;

const WEB_PORT = Number(new URL(E2E_BASE_URL).port);
const PIPELINE_PORT = 8101;
const BASE_URL = E2E_BASE_URL;
// Shared only between this run's web app and pipeline service; not a real secret.
const SERVICE_TOKEN = "e2e-local-service-token";

// CI installs the pipeline's requirements into the runner's Python; locally there's a venv.
const python = existsSync("apps/pipeline/venv/bin/python") ? "venv/bin/python" : "python";

const serverEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  DATABASE_URL: databaseUrl,
  PIPELINE_SERVICE_TOKEN: SERVICE_TOKEN,
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Tests share one database; they seed unique rows and clean up, but run one at a time so a
  // count on one page never sees another test's rows mid-flight.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `node ./node_modules/vinxi/bin/cli.mjs dev --port ${WEB_PORT}`,
      cwd: "apps/web",
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...serverEnv,
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "e2e-local-only-auth-secret-0123456789abcdef",
        BETTER_AUTH_URL: BASE_URL,
        BETTER_AUTH_TRUSTED_ORIGINS: BASE_URL,
        APP_URL: BASE_URL,
        ADMIN_USERS: E2E_ADMIN_EMAIL,
        PIPELINE_SERVICE_URL: `http://127.0.0.1:${PIPELINE_PORT}`,
      },
    },
    {
      command: `${python} -m uvicorn prepora_pipeline.api:app --port ${PIPELINE_PORT}`,
      cwd: "apps/pipeline",
      // Answers 401 without the service token, which Playwright counts as "up".
      url: `http://127.0.0.1:${PIPELINE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: serverEnv,
    },
  ],
});
