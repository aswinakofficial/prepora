#!/usr/bin/env tsx
/**
 * pnpm lint (also run standalone as: tsx scripts/check-canonical-domain.ts)
 *
 * docs/roadmap/engineering-roadmap.md item 26 requires "one canonical domain across the
 * repository" — prepora.xpar.in (apps/web/lib/site-config.ts). Three different domains used to be
 * scattered across the repo with nothing establishing which was real. This fails the build if a
 * literal URL to the old, wrong domain reappears anywhere, or if a literal URL to the Cloudflare
 * Pages domain (a legitimate but non-canonical deployment target) leaks outside its one functional
 * use in auth's trustedOrigins. Matches only `scheme://domain` — prose mentioning "prepora.in" in
 * a comment (e.g. this file's own header, or docs describing the history) is not a live URL and is
 * intentionally left alone.
 *
 * Scans application source only (apps/, packages/, scripts/) — docs/ legitimately documents this
 * domain's history, including the old wrong values, when describing the problem this item fixes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["apps", "packages", "scripts"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", ".turbo", ".wrangler"]);
const SKIP_FILES = new Set(["routeTree.gen.ts"]);
const SCAN_EXTENSIONS = [".ts", ".tsx", ".txt", ".json"];

// The one legitimate, functional (non-canonical) use of the Cloudflare Pages domain.
const PAGES_DEV_ALLOWED_FILE = join(ROOT, "packages/auth/src/index.ts");

const OLD_DOMAIN_URL = /https?:\/\/prepora\.in\b/;
const PAGES_DEV_URL = /https?:\/\/prepora-9g4\.pages\.dev\b/;

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findSourceFiles(full));
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext)) && !SKIP_FILES.has(entry)) {
      files.push(full);
    }
  }
  return files;
}

const violations: { file: string; issue: string }[] = [];

for (const dir of SCAN_DIRS) {
  for (const filePath of findSourceFiles(join(ROOT, dir))) {
    const content = readFileSync(filePath, "utf-8");

    if (OLD_DOMAIN_URL.test(content)) {
      violations.push({
        file: filePath,
        issue: 'contains a live URL to the old domain "prepora.in"',
      });
    }

    if (PAGES_DEV_URL.test(content) && filePath !== PAGES_DEV_ALLOWED_FILE) {
      violations.push({
        file: filePath,
        issue:
          "contains a live URL to the Cloudflare Pages domain outside its one allowed functional use in packages/auth/src/index.ts",
      });
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ Canonical domain check failed:\n");
  for (const v of violations) {
    console.error(`  ${v.file}\n    ${v.issue}`);
  }
  console.error(
    "\nUse CANONICAL_ORIGIN from apps/web/lib/site-config.ts (https://prepora.xpar.in) instead.\n",
  );
  process.exit(1);
}

console.log("✅ One canonical domain (prepora.xpar.in) used consistently.");
