// Grading a typed answer to a numerical question (docs/specs/03-paper-structure-min.md). Shared by
// the server (attempts.ts's recordAttempt) and practice mode, which grades on the client — so this
// module imports nothing, and the web app reaches it through "@prepora/api/src/shared".

export interface NumericKey {
  /** Accepted ranges, inclusive: "-0.61 to -0.57 OR 0.57 to 0.61" is two. */
  ranges: Array<[number, number]>;
  /** The answer as the key prints it, e.g. "4.24 to 4.26". */
  display: string | null;
}

/** A numerical question's key, from its answer rows: one row per accepted range
 * (docs/specs/03-paper-structure-min.md), or a single `numerical_answer` with no range. */
export function numericKey(
  answers: Array<{
    correctOptionId: string | null;
    numericalAnswer: string | null;
    numericMin: number | null;
    numericMax: number | null;
    rangeGroup: number | null;
  }>,
): NumericKey {
  const rows = answers.filter((a) => !a.correctOptionId && a.numericalAnswer !== null);
  const ranges = rows
    .filter((a) => a.numericMin !== null && a.numericMax !== null)
    .sort((a, b) => (a.rangeGroup ?? 0) - (b.rangeGroup ?? 0))
    .map((a) => [Number(a.numericMin), Number(a.numericMax)] as [number, number]);
  return { ranges, display: rows[0]?.numericalAnswer ?? null };
}

/**
 * A typed number, or NaN. The decimal separator is ".", but "4,25" reads as 4.25 when there's no
 * "." — some candidates type a comma. Anything else that isn't a plain number ("4.2.5", "1e",
 * "four") is NaN, so it's graded wrong rather than guessed at.
 */
export function parseNumericAnswer(raw: string): number {
  let text = raw.trim();
  if (!text.includes(".")) text = text.replace(",", ".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return Number.NaN;
  return Number(text);
}

/**
 * Inside any accepted range, inclusive. A key without ranges is compared as text after trimming,
 * or as a number when both sides are numbers ("4.50" matches "4.5").
 */
export function gradeNumericAnswer(raw: string, key: NumericKey): boolean {
  const value = parseNumericAnswer(raw);
  if (key.ranges.length > 0) {
    return !Number.isNaN(value) && key.ranges.some(([lo, hi]) => value >= lo && value <= hi);
  }
  if (key.display === null) return false;
  if (raw.trim() === key.display.trim()) return true;
  const expected = parseNumericAnswer(key.display);
  return !Number.isNaN(value) && !Number.isNaN(expected) && value === expected;
}

/** "4.24 to 4.26", or "4.25" for a range of one value. */
export function formatNumericRange([lo, hi]: [number, number]): string {
  return lo === hi ? String(lo) : `${lo} to ${hi}`;
}
