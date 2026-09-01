#!/usr/bin/env tsx
/**
 * pnpm content:sitemap
 *
 * Generates sitemap XML files from published content in the database.
 * Splits into: sitemap-pages.xml, sitemap-exams.xml, sitemap-question-sets.xml, sitemap-questions.xml
 *
 * TODO: Wire up DB queries once DATABASE_URL is configured.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.APP_URL ?? "https://prepora.in";
const OUT = resolve(import.meta.dirname, "../apps/web/public");

function makeSitemap(urls: { loc: string; changefreq?: string; priority?: string }[]): string {
  const items = urls.map(({ loc, changefreq = "weekly", priority = "0.7" }) =>
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`;
}

function makeSitemapIndex(sitemaps: string[]): string {
  const items = sitemaps.map((s) =>
    `  <sitemap>\n    <loc>${BASE_URL}/${s}</loc>\n  </sitemap>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}

const staticRoutes = [
  { loc: `${BASE_URL}/`, priority: "1.0", changefreq: "daily" },
  { loc: `${BASE_URL}/exams`, priority: "0.9", changefreq: "daily" },
  { loc: `${BASE_URL}/subjects`, priority: "0.8", changefreq: "weekly" },
  { loc: `${BASE_URL}/practice`, priority: "0.8", changefreq: "monthly" },
  { loc: `${BASE_URL}/search`, priority: "0.5", changefreq: "monthly" },
  { loc: `${BASE_URL}/contribute`, priority: "0.5", changefreq: "monthly" },
];

// Demo data — replace with DB queries after database is wired
const examUrls = [
  { loc: `${BASE_URL}/exams/kerala-psc`, priority: "0.9", changefreq: "weekly" },
  { loc: `${BASE_URL}/exams/gate`, priority: "0.9", changefreq: "weekly" },
  { loc: `${BASE_URL}/exams/ssc-je`, priority: "0.9", changefreq: "weekly" },
];

writeFileSync(`${OUT}/sitemap-pages.xml`, makeSitemap(staticRoutes));
writeFileSync(`${OUT}/sitemap-exams.xml`, makeSitemap(examUrls));
writeFileSync(`${OUT}/sitemap.xml`, makeSitemapIndex([
  "sitemap-pages.xml",
  "sitemap-exams.xml",
  "sitemap-question-sets.xml",
  "sitemap-questions.xml",
]));

console.log("✅ Sitemaps generated in apps/web/public/");
