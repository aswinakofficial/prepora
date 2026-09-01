#!/usr/bin/env tsx
/**
 * pnpm content:duplicates
 *
 * Detects exact and near-duplicate questions across all content files.
 * Reports candidates for human review — never auto-merges.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePreporaMarkdown, findDuplicates } from "@prepora/content";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...findMarkdownFiles(full));
    else if (entry.endsWith(".md")) files.push(full);
  }
  return files;
}

const files = findMarkdownFiles(CONTENT_DIR);
console.log(`\nChecking ${files.length} file(s) for duplicates...\n`);

for (const filePath of files) {
  const content = readFileSync(filePath, "utf-8");
  const result = parsePreporaMarkdown(content, filePath);
  if (!result.data) continue;

  const dups = findDuplicates(result.data.questions);
  if (dups.length === 0) {
    console.log(`✅ ${filePath} — no duplicates`);
    continue;
  }

  console.log(`⚠️  ${filePath} — ${dups.length} duplicate candidate(s):`);
  for (const d of dups) {
    const pct = Math.round(d.similarityScore * 100);
    console.log(
      `   [${d.type.toUpperCase()} ${pct}%] Q${d.questionA.number} ≈ Q${d.questionB.number}`,
    );
    console.log(`     Q${d.questionA.number}: ${d.questionA.text.slice(0, 80)}...`);
    console.log(`     Q${d.questionB.number}: ${d.questionB.text.slice(0, 80)}...`);
  }
}

console.log("\n⚠️  Review duplicates above before importing.\n");
