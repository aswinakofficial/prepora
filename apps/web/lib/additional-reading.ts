// docs/roadmap/engineering-roadmap.md item 21: this logic used to be duplicated between
// app/routes/practice.tsx and app/routes/admin/review.tsx — two independently-written copies of
// "normalize a reading-resource title" and "merge titles/links from several possible shapes into
// one deduped list" that could silently drift apart. One shared implementation now backs both.

export interface AdditionalReadingResource {
  text: string;
  url?: string;
}

export function normalizeReadingTitle(text: string): string {
  return text
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts the text under `${label}:` up to the next of `stopLabels` (or the end of the string).
 * Generic over the label so callers with slightly different section vocabularies (practice.tsx's
 * published-question explanations vs. review.tsx's raw scraped text) can still share one regex
 * builder instead of each maintaining their own.
 */
export function extractLabeledSection(
  content: string,
  label: string,
  stopLabels: string[],
): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedStops = stopLabels
    .map((stop) => stop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(
    `${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${escapedStops}):|$)`,
    "i",
  );
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

/**
 * Merges reading-resource titles/links from as many as three possible shapes (free-text titles
 * already extracted from a larger block, a raw array-or-newline-separated-string field, and a
 * structured {text, url} link list) into one deduped list, keyed by normalized lowercase title —
 * a later entry's URL fills in an earlier bare-title entry's missing one, never the reverse.
 */
export function mergeReadingResources(options: {
  extractedTitles?: string[];
  rawReadings?: string | string[];
  readingLinks?: Array<{ text: string; url?: string }>;
}): AdditionalReadingResource[] {
  const resources = new Map<string, AdditionalReadingResource>();

  const addResource = (text?: string, url?: string) => {
    const title = normalizeReadingTitle(text || "");
    if (!title) return;
    const key = title.toLowerCase();
    const existing = resources.get(key);
    resources.set(key, { text: existing?.text || title, url: url || existing?.url });
  };

  (options.extractedTitles || []).forEach((title) => {
    addResource(title);
  });

  if (Array.isArray(options.rawReadings)) {
    options.rawReadings.forEach((title) => {
      addResource(title);
    });
  } else if (typeof options.rawReadings === "string") {
    options.rawReadings.split(/\n+/).forEach((title) => {
      addResource(title);
    });
  }

  (options.readingLinks || []).forEach((link) => {
    addResource(link.text, link.url);
  });

  return Array.from(resources.values());
}
