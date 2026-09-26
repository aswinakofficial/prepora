import type { getDb } from "@prepora/db";
import { searchQueries } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { PostgresSearchProvider } from "./postgres-provider.js";
import type { SearchResultExam, SearchResultQuestion, SearchResultTopic } from "./types.js";

export interface RunSearchResult {
  searchQueryId: string | null;
  questions: SearchResultQuestion[];
  exams: SearchResultExam[];
  topics: SearchResultTopic[];
}

/**
 * The logic behind search.router.ts's `query` procedure, extracted so it's directly unit-testable
 * without going through oRPC's request machinery — mirrors admin.router.ts's
 * processOneReviewItem extraction (item 21) for the same reason.
 *
 * Logs every non-empty query to search_queries, including zero-result ones — this is both product
 * analytics and the data that tells you what content is missing
 * (docs/roadmap/engineering-roadmap.md item 23).
 */
export async function runSearchAndLog(
  db: ReturnType<typeof getDb>,
  input: { q: string; limit?: number; userId?: string | null },
): Promise<RunSearchResult> {
  const trimmed = input.q.trim();
  if (!trimmed) {
    return { searchQueryId: null, questions: [], exams: [], topics: [] };
  }

  const provider = new PostgresSearchProvider(db);
  const [questions, exams, topics] = await Promise.all([
    provider.searchQuestions(trimmed, { limit: input.limit }),
    provider.searchExams(trimmed, { limit: input.limit }),
    provider.searchTopics(trimmed, { limit: input.limit }),
  ]);

  const resultCount = questions.length + exams.length + topics.length;

  const [logged] = await db
    .insert(searchQueries)
    .values({
      query: trimmed,
      resultCount,
      sessionId: input.userId ?? null,
    })
    .returning({ id: searchQueries.id });

  return { searchQueryId: logged.id, questions, exams, topics };
}

/** The logic behind search.router.ts's `logClick` procedure — extracted for the same reason. */
export async function recordSearchClick(
  db: ReturnType<typeof getDb>,
  input: { searchQueryId: string; resultId: string },
): Promise<void> {
  await db
    .update(searchQueries)
    .set({ clickedResultId: input.resultId })
    .where(eq(searchQueries.id, input.searchQueryId));
}
