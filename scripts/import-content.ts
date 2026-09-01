#!/usr/bin/env tsx
/**
 * pnpm content:import
 *
 * Validates and imports all content Markdown files into PostgreSQL.
 * Run pnpm content:validate first. This script fails if any file is invalid.
 *
 * Usage:
 *   pnpm content:import
 *   pnpm content:import --dry-run   (validate only, no DB writes)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePreporaMarkdown, validateParsedQuestionSet } from "@prepora/content";

const isDryRun = process.argv.includes("--dry-run");
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

async function main() {
  const files = findMarkdownFiles(CONTENT_DIR);
  console.log(`\n${isDryRun ? "[DRY RUN] " : ""}Importing ${files.length} file(s)...\n`);

  let imported = 0;
  let failed = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath, "utf-8");
    const parseResult = parsePreporaMarkdown(content, filePath);

    if (!parseResult.data) {
      console.error(`❌ ${filePath} — parse failed`);
      for (const e of parseResult.errors) console.error(`   ${e}`);
      failed++;
      continue;
    }

    const report = validateParsedQuestionSet(parseResult.data, filePath);
    if (!report.valid) {
      console.error(`❌ ${filePath} — validation failed (${report.issues.filter(i => i.severity === "error").length} errors)`);
      failed++;
      continue;
    }

    if (!isDryRun) {
      // TODO: Wire up actual DB import once DATABASE_URL is configured.
      // Stub that shows the structure:
      // const { db } = await import("@prepora/db");
      // await importQuestionSet(db, parseResult.data);
      console.log(`✅ ${filePath} — ${report.totalQuestions} questions (db write skipped — wire up DATABASE_URL)`);
    } else {
      console.log(`✅ ${filePath} — ${report.totalQuestions} questions valid`);
    }

    imported++;
  }

  console.log(`\nImport complete: ${imported} succeeded, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
