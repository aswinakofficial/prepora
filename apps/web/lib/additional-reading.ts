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

  const addResource = (rawText?: string, rawUrl?: string) => {
    const parsed = parseReadingLine(rawText || "");
    const title = parsed.text;
    if (!title) return;
    const url = safeReadingUrl(rawUrl) || parsed.url;
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

// Only ever link out over http(s). These URLs come from scraped pages and end up in an <a href>,
// so anything else — javascript:, data:, a relative path — is dropped rather than rendered.
function safeReadingUrl(url?: string): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/**
 * One line of an "Additional Reading:" section: either a bare title, or a Markdown-style link
 * `[title](https://...)` — the form packages/api's review approval writes when the scraper
 * captured the resource's URL, so the link survives into the published explanation.
 */
export function parseReadingLine(line: string): AdditionalReadingResource {
  const title = normalizeReadingTitle(line);
  const link = title.match(/^\[(.+)\]\((\S+)\)$/);
  if (link) {
    const url = safeReadingUrl(link[2]);
    if (url) return { text: normalizeReadingTitle(link[1]), url };
  }
  return { text: title };
}

const EXPLANATION_SECTION_LABELS = [
  "Objective",
  "What This Item Tests",
  "Rationale",
  "Additional Reading Resources",
];

/**
 * Splits a published explanation into the explanation proper and its "Additional Reading:"
 * resources (titles, with URLs where the explanation carries them). Shared by practice mode and
 * the single-question page so both show the same clickable list.
 */
export function splitExplanationAndReadings(explanation: string): {
  explanation: string;
  readings: AdditionalReadingResource[];
} {
  const section = extractLabeledSection(
    explanation,
    "Additional Reading",
    EXPLANATION_SECTION_LABELS,
  );
  const sectionPattern = new RegExp(
    `Additional Reading:\\s*[\\s\\S]*?(?=\\n\\s*(?:${EXPLANATION_SECTION_LABELS.join("|")}):|$)`,
    "i",
  );
  return {
    explanation: explanation.replace(sectionPattern, "").trim(),
    readings: mergeReadingResources({
      extractedTitles: section ? section.split(/\n+/).filter(Boolean) : [],
    }),
  };
}
