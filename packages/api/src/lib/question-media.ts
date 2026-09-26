import type { getDb } from "@prepora/db";
import { media } from "@prepora/db/schema";
import { and, asc, inArray } from "drizzle-orm";

// A question's images, as the web app renders them. Files live in the media store the scraper
// writes to (apps/pipeline/prepora_pipeline/core/media_store.py) and are served by the
// /api/media/<storageKey> handler in apps/web/app/ssr.tsx.

export type ImagePlacement = "question" | "option" | "explanation";

export interface QuestionImage {
  url: string;
  placement: ImagePlacement;
  optionKey: string | null;
  alt: string | null;
}

export function mediaUrl(storageKey: string): string {
  return `/api/media/${storageKey}`;
}

/** Images for many questions at once, in display order, keyed by question id. */
export async function loadQuestionImages(
  db: ReturnType<typeof getDb>,
  questionIds: string[],
  placements: ImagePlacement[] = ["question", "option", "explanation"],
): Promise<Map<string, QuestionImage[]>> {
  const byQuestion = new Map<string, QuestionImage[]>();
  if (questionIds.length === 0) return byQuestion;

  const rows = await db
    .select({
      questionId: media.questionId,
      storageKey: media.storageKey,
      placement: media.placement,
      optionKey: media.optionKey,
      altText: media.altText,
    })
    .from(media)
    .where(and(inArray(media.questionId, questionIds), inArray(media.placement, placements)))
    .orderBy(asc(media.placement), asc(media.optionKey), asc(media.position));

  for (const row of rows) {
    if (!row.questionId) continue;
    const list = byQuestion.get(row.questionId) ?? [];
    list.push({
      url: mediaUrl(row.storageKey),
      placement: row.placement as ImagePlacement,
      optionKey: row.optionKey,
      alt: row.altText,
    });
    byQuestion.set(row.questionId, list);
  }
  return byQuestion;
}
