import { answerKeysForReviewElement } from "./review-answers.js";
import { msLearnQualityChecks } from "./sources/ms-learn.js";

// Checks a scraped review batch for extraction failures, so a reviewer sees them before approving
// rather than after publishing. The checks every batch gets live here; ones specific to a source —
// failures only that source's scraper has had — live with that source (lib/sources/) and apply
// only to batches scraped from it. Adding a source's checks means adding one entry to
// SOURCE_QUALITY_CHECKS, not changing this file's logic.

export interface ReviewQualityIssue {
  code: string;
  count: number;
  message: string;
}

export interface ReviewElement {
  questionText?: string;
  options?: string[];
  answer?: string;
  explanation?: string | null;
  additionalReadingLinks?: Array<{ text?: string; url?: string }>;
}

export interface QualityCheck {
  code: string;
  /** True when the question has the problem. */
  test: (el: ReviewElement) => boolean;
  /** Completes "N of M questions …". */
  what: string;
}

export interface SourceQualityChecks {
  source: string;
  appliesTo: (sourceUrl: string) => boolean;
  checks: QualityCheck[];
}

export const SOURCE_QUALITY_CHECKS: SourceQualityChecks[] = [msLearnQualityChecks];

const GENERIC_CHECKS: QualityCheck[] = [
  {
    code: "answer_not_in_options",
    test: (el) => {
      if (!el.options || !el.answer) return true;
      try {
        answerKeysForReviewElement({ options: el.options, answer: el.answer });
        return false;
      } catch {
        return true;
      }
    },
    what: "have an answer that matches none of their options",
  },
];

export function reviewQualityIssues(
  elements: ReviewElement[],
  sourceUrl?: string | null,
): ReviewQualityIssue[] {
  const sourceChecks = sourceUrl
    ? SOURCE_QUALITY_CHECKS.filter((s) => s.appliesTo(sourceUrl)).flatMap((s) => s.checks)
    : [];
  return [...sourceChecks, ...GENERIC_CHECKS]
    .map((check) => ({ check, n: elements.filter(check.test).length }))
    .filter(({ n }) => n > 0)
    .map(({ check, n }) => ({
      code: check.code,
      count: n,
      message: `${n} of ${elements.length} question${elements.length === 1 ? "" : "s"} ${check.what}`,
    }));
}
