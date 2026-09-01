#!/usr/bin/env tsx
/**
 * pnpm content:validate
 *
 * Validates all Markdown files in content/ against the Prepora schema.
 * Exits with code 1 if any file has errors.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePreporaMarkdown, validateParsedQuestionSet, formatReport } from "@prepora/content";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

const files = findMarkdownFiles(CONTENT_DIR);
console.log(`\nValidating ${files.length} content file(s)...\n`);

let hasErrors = false;

for (const filePath of files) {
  const content = readFileSync(filePath, "utf-8");
  const parseResult = parsePreporaMarkdown(content, filePath);

  if (!parseResult.data) {
    console.error(`❌ ${filePath}`);
    for (const err of parseResult.errors) console.error(`   ${err}`);
    hasErrors = true;
    continue;
  }

  const report = validateParsedQuestionSet(parseResult.data, filePath);
  console.log(formatReport(report));

  if (!report.valid) hasErrors = true;
}

if (hasErrors) {
  console.error("\n❌ Validation failed. Fix the errors above before importing.\n");
  process.exit(1);
} else {
  console.log("\n✅ All files are valid.\n");
}
