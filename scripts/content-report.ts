#!/usr/bin/env tsx
/**
 * pnpm content:report
 *
 * Generates a summary report of all content files.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePreporaMarkdown, validateParsedQuestionSet } from "@prepora/content";

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
let totalQuestions = 0, validQuestions = 0, needsReview = 0, invalidFiles = 0;

for (const filePath of files) {
  const content = readFileSync(filePath, "utf-8");
  const result = parsePreporaMarkdown(content, filePath);
  if (!result.data) { invalidFiles++; continue; }
  const report = validateParsedQuestionSet(result.data, filePath);
  totalQuestions += report.totalQuestions;
  validQuestions += report.validQuestions;
  needsReview += report.needsReview;
  if (!report.valid) invalidFiles++;
}

console.log(`
Prepora Content Report
══════════════════════
Files scanned   : ${files.length}
Invalid files   : ${invalidFiles}

Total questions : ${totalQuestions}
Valid questions : ${validQuestions}
Needs review    : ${needsReview}
`);
