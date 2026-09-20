import type { getDb } from "@prepora/db";
import { sql } from "drizzle-orm";
import type {
  SearchOptions,
  SearchProvider,
  SearchResultExam,
  SearchResultQuestion,
  SearchResultTopic,
} from "./types.js";

const DEFAULT_LIMIT = 20;

// docs/roadmap/engineering-roadmap.md item 23 (ADR-006): Postgres full-text search behind the
// SearchProvider interface — no dedicated search infrastructure until the corpus actually needs
// one. Every query is scoped to published content only; draft/flagged/archived material is never
// searchable.
export class PostgresSearchProvider implements SearchProvider {
  constructor(private readonly db: ReturnType<typeof getDb>) {}

  async searchQuestions(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResultQuestion[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;

    // One representative occurrence per question (a question can legitimately appear in several
    // exams/years — item 18) — DISTINCT ON picks the most recent year's occurrence, then the
    // outer query re-sorts the deduplicated set by search rank, since DISTINCT ON's own ORDER BY
    // decides which row survives per group, not the final result order.
    const result = await this.db.execute(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (q.id)
          q.id,
          q.slug,
          q.question_text AS "questionText",
          e.slug AS "examSlug",
          ev.slug AS "examVariantSlug",
          es.year,
          s.slug AS "subjectSlug",
          ts_rank(q.search_vector, plainto_tsquery('english', ${query})) AS rank
        FROM questions q
        JOIN question_occurrences qo ON qo.question_id = q.id
        JOIN question_sets qs ON qs.id = qo.question_set_id
        JOIN exam_variants ev ON ev.id = qs.exam_variant_id
        JOIN exams e ON e.id = ev.exam_id
        LEFT JOIN exam_sessions es ON es.id = qs.exam_session_id
        LEFT JOIN subjects s ON s.id = qs.subject_id
        WHERE q.status = 'published'
          AND q.search_vector @@ plainto_tsquery('english', ${query})
        ORDER BY q.id, es.year DESC NULLS LAST
      ) ranked
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return result.rows as unknown as SearchResultQuestion[];
  }

  async searchExams(query: string, options: SearchOptions = {}): Promise<SearchResultExam[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;

    const result = await this.db.execute(sql`
      SELECT id, slug, name,
        ts_rank(to_tsvector('english', name), plainto_tsquery('english', ${query})) AS rank
      FROM exams
      WHERE status = 'published'
        AND to_tsvector('english', name) @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return result.rows as unknown as SearchResultExam[];
  }

  async searchTopics(query: string, options: SearchOptions = {}): Promise<SearchResultTopic[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;

    const result = await this.db.execute(sql`
      SELECT t.id, t.slug, t.name, s.slug AS "subjectSlug",
        ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', ${query})) AS rank
      FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      WHERE to_tsvector('english', t.name) @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return result.rows as unknown as SearchResultTopic[];
  }
}
