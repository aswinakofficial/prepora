import { defineWorkspace } from "vitest/config";

// One entry per package with a real test suite. Each package keeps its own `vitest run` script
// (so `pnpm --filter <pkg> test` works standalone); this file is what lets a single `pnpm test` at
// the repo root discover and run all of them together. Add a package here as soon as it gains its
// first test file — an empty/no-test package listed here is harmless (vitest reports 0 tests for
// it), so there's no reason to wait.
export default defineWorkspace([
  "packages/content",
  "packages/api",
  "packages/db",
  "packages/auth",
  "apps/web",
]);
