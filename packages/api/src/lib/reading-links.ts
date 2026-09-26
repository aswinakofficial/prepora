// Scraped MS Learn questions carry their "Additional Reading" resources twice: as bare titles in
// the explanation text, and as structured {text, url} pairs (`additionalReadingLinks`,
// apps/scraper/ms_learn_catalog_crawler.py). Publishing only sends the explanation, so the URLs
// used to be dropped and practice mode could only show plain-text titles. This folds each URL into
// its title line as `[title](url)` — the form apps/web/lib/additional-reading.ts's
// parseReadingLine() turns back into a link.

const SECTION_LABEL = /^\s*Additional Reading:\s*(.*)$/i;
const NEXT_SECTION =
  /^\s*(Objective|What This Item Tests|Rationale|Additional Reading Resources):/i;

const normalizeTitle = (text: string) =>
  text
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

export function explanationWithReadingLinks(
  explanation: string | null | undefined,
  links: Array<{ text?: string; url?: string }> | null | undefined,
): string | null {
  const usable = (links ?? [])
    .map((l) => ({ text: normalizeTitle(l.text ?? ""), url: (l.url ?? "").trim() }))
    // Only http(s) — these end up as an <a href> on the public site.
    .filter((l) => l.text && /^https?:\/\//i.test(l.url) && !/[\s()]/.test(l.url));
  if (usable.length === 0) return explanation || null;

  const urlByTitle = new Map(usable.map((l) => [l.text.toLowerCase(), l.url]));
  const linked = new Set<string>();
  const toLine = (title: string) => {
    const url = urlByTitle.get(title.toLowerCase());
    if (!url) return title;
    linked.add(title.toLowerCase());
    return `[${title}](${url})`;
  };

  const lines = (explanation ?? "").split("\n");
  const start = lines.findIndex((line) => SECTION_LABEL.test(line));
  if (start === -1) {
    const section = usable.map((l) => toLine(l.text)).join("\n");
    return `${(explanation ?? "").trimEnd()}${explanation ? "\n\n" : ""}Additional Reading:\n${section}`;
  }

  let end = start + 1;
  while (end < lines.length && !NEXT_SECTION.test(lines[end])) end++;

  const inline = lines[start].match(SECTION_LABEL)?.[1]?.trim();
  const titles = [...(inline ? [inline] : []), ...lines.slice(start + 1, end)]
    .map(normalizeTitle)
    .filter(Boolean);
  const sectionLines = titles.map(toLine);
  for (const l of usable) {
    if (!linked.has(l.text.toLowerCase())) sectionLines.push(toLine(l.text));
  }

  return [...lines.slice(0, start), "Additional Reading:", ...sectionLines, ...lines.slice(end)]
    .join("\n")
    .trimEnd();
}
