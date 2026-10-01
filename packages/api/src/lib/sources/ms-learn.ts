import type { SourceQualityChecks } from "../review-quality.js";

// Microsoft Learn's part of the review queue's quality checks (lib/review-quality.ts): extraction
// failures the MS Learn crawler actually had (apps/scraper/ms_learn_parser.py's docstring has the
// history), checked only on batches scraped from Microsoft Learn.

const PLACEHOLDER_EXPLANATION = /^\s*Extracted directly from Microsoft Learn/i;
const PAGE_TITLE_SUFFIX = /\|\s*Microsoft Learn/i;

// Microsoft Learn's global header menu, which an old crawler picked up as reading links: the site
// home, the top-level hubs (/en-us/docs/, /en-us/training/, …), the training catalogue browser, and
// the product menus, which carry a ?product= filter (/en-us/azure/?product=popular). A product's
// documentation home (/power-automate/, "Power Automate documentation") is only one segment deep
// too, but Microsoft does cite those as reading, so depth alone doesn't make a menu link.
const SITE_MENU_HUBS = new Set([
  "answers",
  "assessments",
  "credentials",
  "docs",
  "samples",
  "shows",
  "topics",
  "training",
]);

export function isSiteMenuLink(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!isMsLearnHost(parsed.hostname)) return false;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const rest = /^[a-z]{2}-[a-z]{2}$/i.test(segments[0] ?? "") ? segments.slice(1) : segments;
  if (rest.length === 0) return true;
  if (rest[0] === "training" && rest[1] === "browse") return true;
  if (rest.length > 1) return false;
  return (
    SITE_MENU_HUBS.has(rest[0].toLowerCase()) ||
    parsed.searchParams.has("product") ||
    parsed.searchParams.has("products")
  );
}

function isMsLearnHost(hostname: string): boolean {
  return hostname === "learn.microsoft.com" || hostname.endsWith(".learn.microsoft.com");
}

export const msLearnQualityChecks: SourceQualityChecks = {
  source: "ms-learn",
  appliesTo: (sourceUrl) => {
    try {
      return isMsLearnHost(new URL(sourceUrl).hostname);
    } catch {
      return false;
    }
  },
  checks: [
    {
      code: "placeholder_explanation",
      // The old crawler's stand-in text is the failure signal. A question genuinely published
      // without a rationale (explanation null) isn't a broken scrape, and re-scraping won't
      // change it.
      test: (el) => !!el.explanation && PLACEHOLDER_EXPLANATION.test(el.explanation),
      what: "have a placeholder instead of the real explanation",
    },
    {
      code: "page_title_in_question",
      test: (el) => PAGE_TITLE_SUFFIX.test(el.questionText ?? ""),
      what: 'have "| Microsoft Learn" page titles inside the question text',
    },
    {
      code: "site_menu_links",
      test: (el) => (el.additionalReadingLinks ?? []).some((l) => isSiteMenuLink(l.url)),
      what: "list Microsoft Learn site-menu links as reading",
    },
  ],
};
