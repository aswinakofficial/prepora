import { describe, expect, it } from "vitest";
import type { ParsedQuestionSet, Question } from "./schema.ts";
import { validateParsedQuestionSet } from "./validate.ts";

const FRONTMATTER: ParsedQuestionSet["frontmatter"] = {
  id: "TEST-2025-SUBJ",
  exam: "test-exam",
  exam_variant: "test-variant",
  year: 2025,
  subject: "test-subject",
  title: "Test Question Set",
  source_type: "official",
};

function validQuestion(overrides: Partial<Question> = {}): Question {
  return {
    number: 1,
    questionText: "What is 2 + 2?",
    questionType: "mcq",
    options: [
      { key: "A", text: "3" },
      { key: "B", text: "4" },
    ],
    answer: { type: "mcq", correctKey: "B" },
    explanation: "Basic arithmetic.",
    needsReview: false,
    ...overrides,
  };
}

function report(questions: Question[]) {
  const parsed: ParsedQuestionSet = { frontmatter: FRONTMATTER, questions };
  return validateParsedQuestionSet(parsed, "test.md");
}

describe("validateParsedQuestionSet", () => {
  it("passes a well-formed MCQ question with no issues", () => {
    const r = report([validQuestion()]);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.totalQuestions).toBe(1);
    expect(r.validQuestions).toBe(1);
  });

  it("MISSING_QUESTION_TEXT: flags empty question text as an error", () => {
    const r = report([validQuestion({ questionText: "" })]);
    expect(r.valid).toBe(false);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "MISSING_QUESTION_TEXT", severity: "error" }),
    );
  });

  it("MCQ_MISSING_OPTIONS: flags an MCQ with fewer than 2 options", () => {
    const r = report([validQuestion({ options: [{ key: "A", text: "Only one" }] })]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "MCQ_MISSING_OPTIONS", severity: "error" }),
    );
  });

  it("DUPLICATE_OPTION_KEYS: flags two options sharing the same key", () => {
    const r = report([
      validQuestion({
        options: [
          { key: "A", text: "First" },
          { key: "A", text: "Duplicate key" },
        ],
      }),
    ]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_OPTION_KEYS", severity: "error" }),
    );
  });

  it("MISSING_ANSWER: flags a question with no answer at all", () => {
    const r = report([validQuestion({ answer: undefined })]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "MISSING_ANSWER", severity: "error" }),
    );
  });

  it("INVALID_ANSWER_KEY: flags an MCQ answer key absent from the options", () => {
    const r = report([validQuestion({ answer: { type: "mcq", correctKey: "Z" } })]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_ANSWER_KEY", severity: "error" }),
    );
  });

  it("INVALID_ANSWER_KEY is not checked for non-mcq answer types (a real gap, not this test's concern)", () => {
    // multiple_correct answers are never cross-checked against options at all — documenting
    // current behaviour, matching docs/architecture/prepora-next-level-plan.md's own audit note.
    const r = report([
      validQuestion({
        options: [
          { key: "A", text: "One" },
          { key: "B", text: "Two" },
        ],
        answer: { type: "multiple_correct", correctKeys: ["Z", "Y"] },
      }),
    ]);
    expect(r.issues.some((i) => i.code === "INVALID_ANSWER_KEY")).toBe(false);
  });

  it("MISSING_EXPLANATION: warns (not errors) when explanation is absent", () => {
    const r = report([validQuestion({ explanation: undefined })]);
    const issue = r.issues.find((i) => i.code === "MISSING_EXPLANATION");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    // A warning alone must not make the report invalid.
    expect(r.valid).toBe(true);
  });

  it("NEEDS_REVIEW: flags a question the parser marked needsReview, using its reviewNote", () => {
    const r = report([
      validQuestion({ needsReview: true, reviewNote: "Ambiguous source material" }),
    ]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        code: "NEEDS_REVIEW",
        severity: "error",
        message: "Ambiguous source material",
      }),
    );
    expect(r.valid).toBe(false);
  });

  it("aggregates validQuestions/needsReview counts across a mixed set", () => {
    const r = report([
      validQuestion({ number: 1 }),
      validQuestion({ number: 2, questionText: "" }), // 1 error
      validQuestion({ number: 3, needsReview: true, reviewNote: "flagged" }), // 1 error
    ]);
    expect(r.totalQuestions).toBe(3);
    expect(r.validQuestions).toBe(1);
    expect(r.needsReview).toBe(1);
    expect(r.valid).toBe(false);
  });

  it("never lets validQuestions go negative even with more errors than questions", () => {
    // A single question can trigger multiple error-severity issues at once.
    const r = report([validQuestion({ questionText: "", answer: undefined })]);
    expect(r.validQuestions).toBeGreaterThanOrEqual(0);
  });
});
