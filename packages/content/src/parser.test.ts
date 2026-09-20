import { describe, expect, it } from "vitest";
import { parsePreporaMarkdown } from "./parser.ts";

// These tests document the parser's actual current behaviour — they exist to catch regressions,
// not to assert what the parser *should* do beyond that. See the dedicated FLAG FOR HUMAN REVIEW
// tests below for the docs/architecture/prepora-next-level-plan.md finding #12 /
// docs/roadmap/engineering-roadmap.md item 19 defect fix.

const VALID_FRONTMATTER = `---
id: TEST-2025-SUBJ
exam: test-exam
exam_variant: test-variant
year: 2025
subject: test-subject
title: Test Question Set
---
`;

describe("parsePreporaMarkdown — frontmatter", () => {
  it("rejects markdown with missing required frontmatter fields", () => {
    const result = parsePreporaMarkdown(`---\nid: TEST\n---\n\n# Question 1\nSomething?\n`);
    expect(result.data).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("Frontmatter"))).toBe(true);
  });

  it("accepts markdown with complete frontmatter", () => {
    const result = parsePreporaMarkdown(
      `${VALID_FRONTMATTER}\n# Question 1\nWhat is 2+2?\n\n- A. 3\n- B. 4\n\n**Answer:** B\n`,
    );
    expect(result.data).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.data?.frontmatter.exam).toBe("test-exam");
    expect(result.data?.frontmatter.year).toBe(2025);
  });

  it("reports an error when no question blocks are found", () => {
    const result = parsePreporaMarkdown(
      `${VALID_FRONTMATTER}\nJust some prose, no question headings.\n`,
    );
    expect(result.data).toBeNull();
    expect(result.errors).toContain("No questions found in content");
  });
});

describe("parsePreporaMarkdown — question blocks", () => {
  it("parses an MCQ with options and a single-letter answer", () => {
    const md = `${VALID_FRONTMATTER}
# Question 1

What is the unit of modulus of elasticity?

- A. N
- B. N/mm²
- C. mm/N
- D. N/mm

**Answer:** B

**Explanation:**

Modulus of elasticity = Stress / Strain.
`;
    const { data } = parsePreporaMarkdown(md);
    const q = data?.questions[0];
    if (!q) throw new Error("expected a parsed question");
    expect(q.number).toBe(1);
    expect(q.questionText).toBe("What is the unit of modulus of elasticity?");
    expect(q.questionType).toBe("mcq");
    expect(q.options).toEqual([
      { key: "A", text: "N" },
      { key: "B", text: "N/mm²" },
      { key: "C", text: "mm/N" },
      { key: "D", text: "N/mm" },
    ]);
    expect(q.answer).toEqual({ type: "mcq", correctKey: "B" });
    expect(q.explanation).toContain("Modulus of elasticity");
    expect(q.needsReview).toBe(false);
  });

  it("parses '- A)' option syntax identically to '- A.'", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nPick one.\n\n- A) First\n- B) Second\n\n**Answer:** A\n`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].options).toEqual([
      { key: "A", text: "First" },
      { key: "B", text: "Second" },
    ]);
  });

  it("parses a multiple-correct answer ('A, C')", () => {
    const md = `${VALID_FRONTMATTER}
# Question 1

Which are true?

- A. One
- B. Two
- C. Three
- D. Four

**Answer:** A, C
`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].answer).toEqual({
      type: "multiple_correct",
      correctKeys: ["A", "C"],
    });
  });

  it("parses a numerical answer", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nCalculate x.\n\n**Answer:** 42.5\n`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].answer).toEqual({ type: "numerical", answer: "42.5" });
    // No options -> descriptive, not mcq
    expect(data?.questions[0].questionType).toBe("descriptive");
  });

  it("splits questions on bare '---' as well as '# Question N' headings", () => {
    const md = `${VALID_FRONTMATTER}
# Question 1
First question?

- A. X
- B. Y

**Answer:** A

---

Second question?

- A. X
- B. Y

**Answer:** B
`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions).toHaveLength(2);
    expect(data?.questions[0].number).toBe(1);
    expect(data?.questions[1].number).toBe(2);
    expect(data?.questions[1].answer).toEqual({ type: "mcq", correctKey: "B" });
  });

  it("captures Topic and Difficulty lines", () => {
    const md = `${VALID_FRONTMATTER}
# Question 1
Q?

- A. X
- B. Y

**Answer:** A

**Topic:** Strength of Materials

**Difficulty:** medium
`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].topic).toBe("Strength of Materials");
    expect(data?.questions[0].difficulty).toBe("medium");
  });

  it("ignores an invalid Difficulty value rather than throwing", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nQ?\n\n**Answer:** 1\n\n**Difficulty:** impossible\n`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].difficulty).toBeUndefined();
  });

  it("flags needsReview when no answer line is present at all", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nA question with no answer.\n`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].needsReview).toBe(true);
    expect(data?.questions[0].answer).toBeUndefined();
  });

  it("flags needsReview when an MCQ answer key isn't among the parsed options", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nQ?\n\n- A. X\n- B. Y\n\n**Answer:** Z\n`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].needsReview).toBe(true);
    expect(data?.questions[0].reviewNote).toContain("not in options");
  });

  // Regression tests for docs/architecture/prepora-next-level-plan.md finding #12 / roadmap item
  // 19: the documented content convention (agents/content/rules.md's Flagging section) mandates
  // the literal string "FLAG FOR HUMAN REVIEW" as the answer whenever the source material doesn't
  // support one. The parser used to parse it as an ordinary free-text answer instead of
  // recognising it, so the documented safety net never fired.
  it("flags needsReview for the documented FLAG FOR HUMAN REVIEW convention, with its reason", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nAn ambiguous question.\n\n**Answer:** FLAG FOR HUMAN REVIEW — multiple plausible answers\n`;
    const { data } = parsePreporaMarkdown(md);
    const q = data?.questions[0];
    if (!q) throw new Error("expected a parsed question");
    expect(q.answer).toBeUndefined();
    expect(q.needsReview).toBe(true);
    expect(q.reviewNote).toBe("multiple plausible answers");
  });

  it("flags needsReview for FLAG FOR HUMAN REVIEW with no reason given", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nAn ambiguous question.\n\n**Answer:** FLAG FOR HUMAN REVIEW\n`;
    const { data } = parsePreporaMarkdown(md);
    const q = data?.questions[0];
    if (!q) throw new Error("expected a parsed question");
    expect(q.answer).toBeUndefined();
    expect(q.needsReview).toBe(true);
    expect(q.reviewNote).toBe("Flagged for human review by content agent");
  });

  it("is case-insensitive and tolerant of an em-dash or hyphen before the reason", () => {
    const md = `${VALID_FRONTMATTER}\n# Question 1\nQ?\n\n**Answer:** flag for human review - ocr unreadable\n`;
    const { data } = parsePreporaMarkdown(md);
    const q = data?.questions[0];
    if (!q) throw new Error("expected a parsed question");
    expect(q.needsReview).toBe(true);
    expect(q.reviewNote).toBe("ocr unreadable");
  });

  it("joins multi-line explanations with a newline", () => {
    const md = `${VALID_FRONTMATTER}
# Question 1
Q?

**Answer:** 1

**Explanation:**

Line one.
Line two.
`;
    const { data } = parsePreporaMarkdown(md);
    expect(data?.questions[0].explanation).toBe("Line one.\nLine two.");
  });
});
