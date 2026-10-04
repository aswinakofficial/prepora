import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Before any e2e test: bring the local test database (E2E_DATABASE_URL, checked in
// playwright.config.ts) up to the current schema, and register the connectors' sources, the same
// two steps a real local setup runs.
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL };
  execFileSync("pnpm", ["db:migrate"], { env, stdio: "inherit" });
  const python = existsSync("apps/pipeline/venv/bin/python") ? "venv/bin/python" : "python";
  execFileSync(python, ["-m", "prepora_pipeline.cli", "sync-sources"], {
    cwd: "apps/pipeline",
    env,
    stdio: "inherit",
  });
}
