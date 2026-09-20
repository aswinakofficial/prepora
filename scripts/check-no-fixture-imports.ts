#!/usr/bin/env tsx
/**
 * pnpm lint (also run standalone as: tsx scripts/check-no-fixture-imports.ts)
 *
 * docs/roadmap/engineering-roadmap.md item 24 ("Retire the mock datasets") requires a CI rule
 * forbidding fixture imports in route files, so a fixture reintroduced later fails the build
 * instead of silently shipping — see apps/web/app/lib/dev-fixtures/README.md for the convention
 * this enforces.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ROUTES_DIR = join(ROOT, "apps/web/app/routes");
const FORBIDDEN_PATTERNS = [/dev-fixtures/, /\/fixtures\//];

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...findSourceFiles(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
  }
  return files;
}

const importPattern = /from\s+["']([^"']+)["']/g;

const violations: { file: string; specifier: string }[] = [];

for (const filePath of findSourceFiles(ROUTES_DIR)) {
  const content = readFileSync(filePath, "utf-8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (FORBIDDEN_PATTERNS.some((p) => p.test(specifier))) {
      violations.push({ file: filePath, specifier });
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ Route files must not import dev fixtures:\n");
  for (const v of violations) {
    console.error(`  ${v.file}\n    imports "${v.specifier}"`);
  }
  console.error(
    "\nRoutes must render real data via orpc with an honest empty state — see apps/web/app/lib/dev-fixtures/README.md.\n",
  );
  process.exit(1);
}

console.log("✅ No fixture imports found in route files.");
