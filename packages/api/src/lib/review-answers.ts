const normalizeOptionText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

// The scraper records the correct answer as option *text*, and for "choose two"-style questions
// joins each correct option with " | " (apps/scraper/ms_learn_catalog_crawler.py). This used to
// be looked up with a bare options.indexOf(answer): a multi-answer string never matched, indexOf
// returned -1, and String.fromCharCode(65 + -1) sent "@" as the correct key — which the pipeline
// rightly rejected. Now: an exact whole-answer match wins (an option may itself contain " | "),
// otherwise each " | " part must match an option, whitespace/case-insensitively. Anything still
// unmatched throws, so the question is reported as a failure instead of publishing a wrong key.
export function answerKeysForReviewElement(el: { options: string[]; answer: string }): string[] {
  const keyAt = (i: number) => String.fromCharCode(65 + i);
  const normalizedOptions = el.options.map(normalizeOptionText);
  const find = (text: string) => {
    const exact = el.options.indexOf(text);
    return exact >= 0 ? exact : normalizedOptions.indexOf(normalizeOptionText(text));
  };

  const whole = find(el.answer);
  if (whole >= 0) return [keyAt(whole)];

  const parts = el.answer
    .split(" | ")
    .map((p) => p.trim())
    .filter(Boolean);
  const indexes = parts.map(find);
  const unmatched = parts.filter((_, i) => indexes[i] < 0);
  if (parts.length === 0 || unmatched.length > 0) {
    throw new Error(
      `Correct answer ${JSON.stringify(unmatched.length ? unmatched : el.answer)} doesn't match any option.`,
    );
  }
  return [...new Set(indexes)].sort((a, b) => a - b).map(keyAt);
}
