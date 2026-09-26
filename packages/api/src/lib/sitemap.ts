import type { getDb } from "@prepora/db";
import { sql } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 26: scripts/generate-sitemap.ts used to emit three
// hardcoded demo exam URLs and reference two files (sitemap-question-sets.xml,
// sitemap-questions.xml) it never created — a broken sitemap index in production. This module is
// the real, database-backed logic behind it, extracted the same way search/run-search.ts and
// lib/attempts.ts are, so it's directly unit-testable without shelling out to the script.

export interface SitemapUrl {
  loc: string;
  changefreq?: string;
  priority?: string;
  lastmod?: string;
}

export function getStaticSitemapUrls(
  baseUrl: string,
  options: { contributeEnabled?: boolean } = {},
): SitemapUrl[] {
  const urls: SitemapUrl[] = [
    { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${baseUrl}/exams`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/subjects`, priority: "0.8", changefreq: "weekly" },
    { loc: `${baseUrl}/practice`, priority: "0.8", changefreq: "monthly" },
    { loc: `${baseUrl}/search`, priority: "0.5", changefreq: "monthly" },
  ];
  // The Contribute page only exists for visitors while its feature flag is on
  // (lib/feature-flags.ts); defaults to included, matching the flag's own default.
  if (options.contributeEnabled ?? true) {
    urls.push({ loc: `${baseUrl}/contribute`, priority: "0.5", changefreq: "monthly" });
  }
  return urls;
}

/**
 * Real published exams that have at least one published question — replaces the three hardcoded
 * demo entries this used to ship. An exam with no content yet would just be a thin, empty page, so
 * it's left out the same way exams.list leaves it off the directory.
 */
export async function getExamSitemapUrls(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
): Promise<SitemapUrl[]> {
  const result = await db.execute(sql`
    SELECT e.slug, e.updated_at AS "updatedAt" FROM exams e
    WHERE e.status = 'published'
      AND EXISTS (
        SELECT 1 FROM questions q
        JOIN question_occurrences o ON o.question_id = q.id
        JOIN question_sets qs ON qs.id = o.question_set_id
        JOIN exam_variants ev ON ev.id = qs.exam_variant_id
        WHERE ev.exam_id = e.id AND q.status = 'published'
      )
  `);
  return (result.rows as unknown as { slug: string; updatedAt: string }[]).map((row) => ({
    loc: `${baseUrl}/exams/${row.slug}`,
    priority: "0.9",
    changefreq: "weekly",
    lastmod: new Date(row.updatedAt).toISOString(),
  }));
}

/** Real topics and subjects — the navigation surface that leads to individual questions. */
export async function getTaxonomySitemapUrls(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
): Promise<SitemapUrl[]> {
  const subjects = await db.execute(sql`SELECT slug, updated_at AS "updatedAt" FROM subjects`);
  const topics = await db.execute(sql`SELECT slug, updated_at AS "updatedAt" FROM topics`);

  const subjectUrls = (subjects.rows as unknown as { slug: string; updatedAt: string }[]).map(
    (row) => ({
      loc: `${baseUrl}/subjects/${row.slug}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: new Date(row.updatedAt).toISOString(),
    }),
  );
  const topicUrls = (topics.rows as unknown as { slug: string; updatedAt: string }[]).map(
    (row) => ({
      loc: `${baseUrl}/topics/${row.slug}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: new Date(row.updatedAt).toISOString(),
    }),
  );
  return [...subjectUrls, ...topicUrls];
}

/** Real published question sets — the file this used to reference in its index but never create. */
export async function getQuestionSetSitemapUrls(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
): Promise<SitemapUrl[]> {
  const result = await db.execute(sql`
    SELECT slug, updated_at AS "updatedAt" FROM question_sets WHERE publication_status = 'published'
  `);
  return (result.rows as unknown as { slug: string; updatedAt: string }[]).map((row) => ({
    loc: `${baseUrl}/question-sets/${row.slug}`,
    priority: "0.6",
    changefreq: "monthly",
    lastmod: new Date(row.updatedAt).toISOString(),
  }));
}

/**
 * Real published questions — the other file this used to reference but never create. A question
 * can have multiple occurrences (the same content republished across exams/years); each maps to a
 * different detail URL, so this picks exactly one canonical occurrence per question (earliest
 * exam year, then earliest recorded occurrence) rather than listing near-duplicate URLs for
 * identical content. Only occurrences with both a year and a subject are eligible, since the
 * question-detail route requires both path segments — a question published without either has no
 * valid URL under the current route shape and is correctly excluded here.
 */
export async function getQuestionSitemapUrls(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
): Promise<SitemapUrl[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (q.id)
      q.updated_at AS "updatedAt",
      e.slug AS "examSlug",
      ev.slug AS "examVariantSlug",
      es.year,
      s.slug AS "subjectSlug",
      q.slug AS "questionSlug"
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    JOIN exam_sessions es ON es.id = qs.exam_session_id
    JOIN subjects s ON s.id = qs.subject_id
    WHERE q.status = 'published'
    ORDER BY q.id, es.year ASC NULLS LAST, o.created_at ASC
  `);
  return (
    result.rows as unknown as {
      updatedAt: string;
      examSlug: string;
      examVariantSlug: string;
      year: number;
      subjectSlug: string;
      questionSlug: string;
    }[]
  ).map((row) => ({
    loc: `${baseUrl}/questions/${row.examSlug}/${row.examVariantSlug}/${row.year}/${row.subjectSlug}/${row.questionSlug}`,
    priority: "0.6",
    changefreq: "monthly",
    lastmod: new Date(row.updatedAt).toISOString(),
  }));
}

export function buildSitemapXml(urls: SitemapUrl[]): string {
  const items = urls
    .map(({ loc, changefreq = "weekly", priority = "0.7", lastmod }) => {
      const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`;
}

export function buildSitemapIndexXml(baseUrl: string, filenames: string[]): string {
  const items = filenames
    .map((f) => `  <sitemap>\n    <loc>${baseUrl}/${f}</loc>\n  </sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}
