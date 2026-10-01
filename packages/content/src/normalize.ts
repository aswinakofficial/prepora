// What "the same text" means — the TypeScript port of apps/pipeline/prepora_pipeline/dedupe/
// normalize.py, step for step. Both are pinned to the same cases by that package's
// fixtures/normalization.json (see normalize.test.ts), so a question counts as a duplicate here
// exactly when publishing would count it as one. No dependencies, so the Worker-bundled API
// (packages/api) can import it without the Markdown parser.

export const NORMALIZATION_VERSION = 2;

/** NFC, lowercase, whitespace collapsed, then everything but letters, combining marks, digits and
 * spaces dropped, trimmed. Collapsing before dropping is deliberate: "it — which" keeps two spaces
 * where the dash was, as in Python. */
export function normalizeQuestionText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .trim();
}

/** djb2 over the normalized text, base 36 — the pipeline's content_hash(), an index into
 * normalizeQuestionText() equality rather than a replacement for it (it's only 32 bits). Iterates
 * UTF-16 units, so it matches Python for text within the Basic Multilingual Plane. */
export function contentHash(questionText: string): string {
  const normalized = normalizeQuestionText(questionText);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash.toString(36);
}
