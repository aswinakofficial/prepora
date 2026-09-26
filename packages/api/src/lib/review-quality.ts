import { answerKeysForReviewElement } from "./review-answers.js";

// Checks a scraped review batch for the extraction failures seen in practice, so a reviewer sees
// them before approving rather than after publishing. Each check matches a real past failure of
// the Microsoft Learn crawler (apps/scraper/ms_learn_parser.py's docstring has the history).

export interface ReviewQualityIssue {
  code:
    | "placeholder_explanation"
    | "page_title_in_question"
    | "site_menu_links"
    | "answer_not_in_options";
  count: number;
  message: string;
}

interface ReviewElement {
  questionText?: string;
  options?: string[];
  answer?: string;
  explanation?: string | null;
  additionalReadingLinks?: Array<{ text?: string; url?: string }>;
}

const PLACEHOLDER_EXPLANATION = /^\s*Extracted directly from Microsoft Learn/i;
const PAGE_TITLE_SUFFIX = /\|\s*Microsoft Learn/i;

// Microsoft Learn's global header menu: a locale plus at most one path segment
// (/en-us/azure/?product=popular, /en-us/docs/) or the training catalogue browser. A real reading
// resource always points deeper than that.
export function isSiteMenuLink(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith("learn.microsoft.com")) return false;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const rest = /^[a-z]{2}-[a-z]{2}$/i.test(segments[0] ?? "") ? segments.slice(1) : segments;
  return rest.length <= 1 || (rest[0] === "training" && rest[1] === "browse");
}

export function reviewQualityIssues(elements: ReviewElement[]): ReviewQualityIssue[] {
  const count = (predicate: (el: ReviewElement) => boolean) => elements.filter(predicate).length;

  const checks: Array<[ReviewQualityIssue["code"], number, string]> = [
    [
      "placeholder_explanation",
      // The old crawler's stand-in text is the failure signal. A question genuinely published
      // without a rationale (explanation null) isn't a broken scrape, and re-scraping won't change it.
      count((el) => !!el.explanation && PLACEHOLDER_EXPLANATION.test(el.explanation)),
      "have a placeholder instead of the real explanation",
    ],
    [
      "page_title_in_question",
      count((el) => PAGE_TITLE_SUFFIX.test(el.questionText ?? "")),
      'have "| Microsoft Learn" page titles inside the question text',
    ],
    [
      "site_menu_links",
      count((el) => (el.additionalReadingLinks ?? []).some((l) => isSiteMenuLink(l.url))),
      "list Microsoft Learn site-menu links as reading",
    ],
    [
      "answer_not_in_options",
      count((el) => {
        if (!el.options || !el.answer) return true;
        try {
          answerKeysForReviewElement({ options: el.options, answer: el.answer });
          return false;
        } catch {
          return true;
        }
      }),
      "have an answer that matches none of their options",
    ],
  ];

  return checks
    .filter(([, n]) => n > 0)
    .map(([code, n, what]) => ({
      code,
      count: n,
      message: `${n} of ${elements.length} question${elements.length === 1 ? "" : "s"} ${what}`,
    }));
}
