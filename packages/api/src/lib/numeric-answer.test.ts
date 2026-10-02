import { describe, expect, it } from "vitest";
import {
  formatNumericRange,
  gradeNumericAnswer,
  numericKey,
  parseNumericAnswer,
} from "./numeric-answer.ts";

describe("numeric answers", () => {
  it("reads a plain number, a comma decimal and nothing else", () => {
    expect(parseNumericAnswer(" -0.57 ")).toBe(-0.57);
    expect(parseNumericAnswer(".5")).toBe(0.5);
    expect(parseNumericAnswer("4,25")).toBe(4.25);
    for (const bad of ["", "4.2.5", "1,000.5", "1e3", "four", "4 cm"]) {
      expect(parseNumericAnswer(bad)).toBeNaN();
    }
  });

  it("builds the key from answer rows in range order, ignoring option rows", () => {
    const row = { correctOptionId: null, numericalAnswer: "a OR b" };
    expect(
      numericKey([
        { ...row, numericMin: 0.57, numericMax: 0.61, rangeGroup: 1 },
        { ...row, numericMin: -0.61, numericMax: -0.57, rangeGroup: 0 },
        {
          correctOptionId: "opt",
          numericalAnswer: null,
          numericMin: null,
          numericMax: null,
          rangeGroup: null,
        },
      ]),
    ).toEqual({
      ranges: [
        [-0.61, -0.57],
        [0.57, 0.61],
      ],
      display: "a OR b",
    });
  });

  it("grades inside any range, inclusive, and a rangeless key by value or text", () => {
    const ranged = { ranges: [[4.24, 4.26]] as Array<[number, number]>, display: "4.24 to 4.26" };
    expect(gradeNumericAnswer("4.24", ranged)).toBe(true);
    expect(gradeNumericAnswer("4.26", ranged)).toBe(true);
    expect(gradeNumericAnswer("4.27", ranged)).toBe(false);
    expect(gradeNumericAnswer("x", ranged)).toBe(false);
    expect(gradeNumericAnswer("4.50", { ranges: [], display: "4.5" })).toBe(true);
    expect(gradeNumericAnswer("n/a", { ranges: [], display: " n/a" })).toBe(true);
    expect(gradeNumericAnswer("4.5", { ranges: [], display: null })).toBe(false);
  });

  it("formats a range for display", () => {
    expect(formatNumericRange([4.24, 4.26])).toBe("4.24 to 4.26");
    expect(formatNumericRange([2, 2])).toBe("2");
  });
});
