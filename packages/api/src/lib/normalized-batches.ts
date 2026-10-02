// Review batches that carry complete NormalizedQuestions (docs/specs/05-gate-pilot.md). A pipeline
// connector (GATE first) builds the question itself, with marks, sections, ranges and provenance,
// so approval publishes each element's `normalized` exactly as it is. Nothing is re-derived from
// the display fields (questionText, options, answer), which exist only for the review page.

export const NORMALIZED_FORMAT = "normalized-v1";

export function isNormalizedBatch(metadata: unknown): boolean {
  return (metadata as { format?: unknown } | null)?.format === NORMALIZED_FORMAT;
}

export interface NormalizedElement {
  /** The question's number in its paper: what holds and failures are reported by. */
  number: number;
  element: { questionText?: string };
  normalized: Record<string, unknown>;
}

/** The elements to publish, and those that can't be (no `normalized`), each with its reason. */
export function normalizedElements(elements: unknown[]): {
  publishable: NormalizedElement[];
  failed: Array<{ number: number; preview: string; reason: string }>;
} {
  const publishable: NormalizedElement[] = [];
  const failed: Array<{ number: number; preview: string; reason: string }> = [];
  elements.forEach((raw, index) => {
    const element = (raw ?? {}) as { questionText?: string; normalized?: unknown };
    const normalized = element.normalized;
    const declared = (normalized as { number?: unknown } | undefined)?.number;
    const number = typeof declared === "number" ? declared : index + 1;
    if (!normalized || typeof normalized !== "object") {
      failed.push({
        number,
        preview: (element.questionText ?? "").slice(0, 80),
        reason: "This batch's format is normalized-v1, but the question has no `normalized` data.",
      });
      return;
    }
    publishable.push({ number, element, normalized: normalized as Record<string, unknown> });
  });
  return { publishable, failed };
}
