// The Microsoft Learn crawler used to append "Extracted directly from Microsoft Learn Practice
// Assessment." to every rationale (and to use it as the whole explanation when it found none).
// It's crawler boilerplate, not part of any explanation. The crawler no longer writes it
// (apps/scraper/ms_learn_parser.py), but already-scraped batches still contain it, so approval
// strips it from anything it publishes.
const BOILERPLATE_LINE = /^[ \t]*Extracted directly from Microsoft Learn\b[^\n]*$/gim;

export function stripScraperBoilerplate(explanation: string | null | undefined): string | null {
  if (!explanation) return null;
  const cleaned = explanation
    .replace(BOILERPLATE_LINE, "")
    // Removing a line can leave a blank line at the end of a section or 3+ newlines in a row.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // "Rationale:" with nothing under it is no explanation at all.
  return cleaned && !/^Rationale:\s*$/i.test(cleaned) ? cleaned : null;
}
