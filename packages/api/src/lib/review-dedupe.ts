import type { getDb } from "@prepora/db";
import { sql } from "drizzle-orm";

// How much of a scraped batch is actually new to its exam — shown on each review card, so a
// re-scrape of an assessment reads "12 new · 38 already in exam" before anyone approves it.
// Publishing is what really deduplicates (apps/pipeline's stages/publish.py identifies MS Learn
// questions by content); this is the same comparison, done up front for display.

/** A port of the pipeline's normalize_question_text (stages/content_hash.py), step for step —
 * lowercase, collapse whitespace, drop non-alphanumeric characters (Unicode-aware, like Python's
 * str.isalnum), trim — so this preview counts a question as "already in exam" exactly when
 * publishing would. */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Splits a batch's question texts into ones new to the exam and ones it already has. Repeats
 * within the batch count once. */
export function countNewQuestions(
  batchTexts: string[],
  existingTexts: Iterable<string>,
): { newCount: number; existingCount: number } {
  const existing = new Set([...existingTexts].map(normalizeQuestionText));
  const seen = new Set<string>();
  let newCount = 0;
  let existingCount = 0;
  for (const text of batchTexts) {
    const key = normalizeQuestionText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (existing.has(key)) existingCount++;
    else newCount++;
  }
  return { newCount, existingCount };
}

/** The published question texts of one exam (every set, every variant). */
export async function loadExamQuestionTexts(
  db: ReturnType<typeof getDb>,
  examSlug: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT q.question_text AS "text"
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    WHERE e.slug = ${examSlug}
  `);
  return (result.rows as { text: string }[]).map((row) => row.text);
}
