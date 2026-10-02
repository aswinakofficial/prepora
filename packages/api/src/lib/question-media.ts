import type { getDb } from "@prepora/db";
import { media } from "@prepora/db/schema";
import { and, asc, inArray } from "drizzle-orm";

// A question's images, as the web app renders them. Locally, files live in the media store the
// scraper writes to (apps/pipeline/prepora_pipeline/core/media_store.py) and are served by the
// /api/media/<storageKey> handler in apps/web/app/ssr.tsx. On Cloudflare there's no filesystem:
// publishing copies each image to a public R2 bucket, and MEDIA_PUBLIC_BASE_URL
// (https://media.prepora.xpar.in) points image URLs there (docs/specs/04-media-storage.md).

export type ImagePlacement = "question" | "option" | "explanation";

export interface QuestionImage {
  url: string;
  placement: ImagePlacement;
  optionKey: string | null;
  alt: string | null;
}

export function mediaUrl(storageKey: string): string {
  // Read per call: on Cloudflare, bindings reach process.env per request (lib/runtime-env.ts).
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/${storageKey}` : `/api/media/${storageKey}`;
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
