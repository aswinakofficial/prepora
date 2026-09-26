#!/usr/bin/env tsx
/**
 * pnpm content:sitemap
 *
 * Generates sitemap XML files from published content in the database, split into:
 * sitemap-pages.xml, sitemap-exams.xml, sitemap-question-sets.xml, sitemap-questions.xml.
 *
 * docs/roadmap/engineering-roadmap.md item 26: this used to emit three hardcoded demo exam URLs
 * and reference sitemap-question-sets.xml/sitemap-questions.xml from the index without ever
 * creating them — a broken sitemap in production. The real, database-backed logic lives in
 * packages/api/src/lib/sitemap.ts (also directly unit-tested there); this script just calls it and
 * writes files. Requires DATABASE_URL.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isFeatureEnabled } from "@prepora/api/src/lib/feature-flags.js";
import {
  buildSitemapIndexXml,
  buildSitemapXml,
  getExamSitemapUrls,
  getQuestionSetSitemapUrls,
  getQuestionSitemapUrls,
  getStaticSitemapUrls,
  getTaxonomySitemapUrls,
} from "@prepora/api/src/lib/sitemap.js";
import { getDb } from "@prepora/db";

// The canonical production domain (apps/web/lib/site-config.ts) — hardcoded, not read from
// APP_URL, so a stray environment variable can never make a generated sitemap disagree with the
// domain every canonical tag and JSON-LD block on the site itself uses.
const BASE_URL = "https://prepora.xpar.in";
const OUT = resolve(import.meta.dirname, "../apps/web/public");

async function main() {
  const db = getDb();

  const [examUrls, taxonomyUrls, questionSetUrls, questionUrls] = await Promise.all([
    getExamSitemapUrls(db, BASE_URL),
    getTaxonomySitemapUrls(db, BASE_URL),
    getQuestionSetSitemapUrls(db, BASE_URL),
    getQuestionSitemapUrls(db, BASE_URL),
  ]);

  writeFileSync(
    `${OUT}/sitemap-pages.xml`,
    buildSitemapXml([
      ...getStaticSitemapUrls(BASE_URL, {
        contributeEnabled: await isFeatureEnabled(db, "contribute"),
      }),
      ...taxonomyUrls,
    ]),
  );
  writeFileSync(`${OUT}/sitemap-exams.xml`, buildSitemapXml(examUrls));
  writeFileSync(`${OUT}/sitemap-question-sets.xml`, buildSitemapXml(questionSetUrls));
  writeFileSync(`${OUT}/sitemap-questions.xml`, buildSitemapXml(questionUrls));
  writeFileSync(
    `${OUT}/sitemap.xml`,
    buildSitemapIndexXml(BASE_URL, [
      "sitemap-pages.xml",
      "sitemap-exams.xml",
      "sitemap-question-sets.xml",
      "sitemap-questions.xml",
    ]),
  );

  console.log(
    `✅ Sitemaps generated in apps/web/public/ (${examUrls.length} exams, ${questionSetUrls.length} question sets, ${questionUrls.length} questions, ${taxonomyUrls.length} topics/subjects)`,
  );
}

main().catch((err) => {
  console.error("❌ Sitemap generation failed:", err);
  process.exit(1);
});
