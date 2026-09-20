#!/usr/bin/env tsx
/**
 * pnpm content:rss
 *
 * Generates an RSS XML feed of the most recently published exams and question sets.
 *
 * docs/roadmap/engineering-roadmap.md item 26: this used to ship three hardcoded, future-dated
 * demo entries. The real, database-backed logic lives in packages/api/src/lib/rss.ts; this script
 * just calls it and writes the file. Requires DATABASE_URL.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRssXml,
  getRecentExamRssItems,
  getRecentQuestionSetRssItems,
} from "@prepora/api/src/lib/rss.js";
import { getDb } from "@prepora/db";

// See scripts/generate-sitemap.ts's comment: hardcoded to the canonical domain, not read from
// APP_URL, so this can't drift from what every canonical tag/JSON-LD block on the site itself uses.
const BASE_URL = "https://prepora.xpar.in";
const OUT = resolve(import.meta.dirname, "../apps/web/public");

async function main() {
  const db = getDb();

  const [examItems, questionSetItems] = await Promise.all([
    getRecentExamRssItems(db, BASE_URL),
    getRecentQuestionSetRssItems(db, BASE_URL),
  ]);

  writeFileSync(`${OUT}/rss.xml`, buildRssXml(BASE_URL, [...examItems, ...questionSetItems]));
  console.log(
    `✅ RSS feed generated at apps/web/public/rss.xml (${examItems.length} exams, ${questionSetItems.length} question sets)`,
  );
}

main().catch((err) => {
  console.error("❌ RSS generation failed:", err);
  process.exit(1);
});
