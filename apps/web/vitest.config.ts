import { defineConfig } from "vitest/config";

// Unit tests for the web app's plain TypeScript helpers (lib/). Components and routes are covered
// by the Playwright suite in tests/e2e.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
