import type { getDb } from "@prepora/db";
import { sql } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 26: generate-rss.ts used to ship three hardcoded,
// future-dated demo entries ("Added highly requested Kerala PSC..."). This is the real,
// database-backed replacement — recently published exams and question sets, in the order they
// were actually published.

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}

export async function getRecentExamRssItems(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
  limit = 10,
): Promise<RssItem[]> {
  const result = await db.execute(sql`
    SELECT e.slug, e.name, o.name AS "orgName", e.created_at AS "createdAt"
    FROM exams e
    JOIN organizations o ON o.id = e.organization_id
    WHERE e.status = 'published'
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `);
  return (
    result.rows as unknown as { slug: string; name: string; orgName: string; createdAt: string }[]
  ).map((row) => ({
    title: row.name,
    link: `${baseUrl}/exams/${row.slug}`,
    description: `Practice questions and verified explanations for ${row.name} (${row.orgName}) on Prepora.`,
    pubDate: new Date(row.createdAt).toUTCString(),
    guid: `exam-${row.slug}`,
  }));
}

export async function getRecentQuestionSetRssItems(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
  limit = 10,
): Promise<RssItem[]> {
  const result = await db.execute(sql`
    SELECT qs.slug, qs.title, e.name AS "examName", qs.created_at AS "createdAt"
    FROM question_sets qs
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    WHERE qs.publication_status = 'published'
    ORDER BY qs.created_at DESC
    LIMIT ${limit}
  `);
  return (
    result.rows as unknown as {
      slug: string;
      title: string;
      examName: string;
      createdAt: string;
    }[]
  ).map((row) => ({
    title: row.title,
    link: `${baseUrl}/question-sets/${row.slug}`,
    description: `A new question set for ${row.examName} was published on Prepora.`,
    pubDate: new Date(row.createdAt).toUTCString(),
    guid: `question-set-${row.slug}`,
  }));
}

export function buildRssXml(baseUrl: string, items: RssItem[]): string {
  const sorted = [...items].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  const itemsXml = sorted
    .map(
      (item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="false">${item.guid}</guid>
    </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Prepora - Latest Updates</title>
    <link>${baseUrl}</link>
    <description>Latest exams and question sets added to the Prepora knowledge index.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;
}
