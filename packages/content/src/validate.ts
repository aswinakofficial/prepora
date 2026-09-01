import type { ParsedQuestionSet, ValidationReport, ValidationIssue } from "./schema.ts";

// ─── Business rule validators ─────────────────────────────────────────────────

function validateQuestionBusinessRules(
  question: ParsedQuestionSet["questions"][number],
  issues: ValidationIssue[],
) {
  const n = question.number;

  // Must have question text
  if (!question.questionText || question.questionText.trim().length === 0) {
    issues.push({ questionNumber: n, severity: "error", code: "MISSING_QUESTION_TEXT", message: "Question text is empty" });
  }

  // MCQ must have options
  if (question.questionType === "mcq" && (!question.options || question.options.length < 2)) {
    issues.push({ questionNumber: n, severity: "error", code: "MCQ_MISSING_OPTIONS", message: "MCQ question must have at least 2 options" });
  }

  // Check for duplicate option keys
  if (question.options) {
    const keys = question.options.map((o) => o.key);
    const dupeKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupeKeys.length > 0) {
      issues.push({ questionNumber: n, severity: "error", code: "DUPLICATE_OPTION_KEYS", message: `Duplicate option keys: ${dupeKeys.join(", ")}` });
    }
  }

  // Missing answer
  if (!question.answer) {
    issues.push({ questionNumber: n, severity: "error", code: "MISSING_ANSWER", message: "No answer found" });
  }

  // MCQ: answer key must exist in options
  if (question.answer?.type === "mcq" && question.options) {
    const optionKeys = question.options.map((o) => o.key);
    if (!optionKeys.includes(question.answer.correctKey)) {
      issues.push({
        questionNumber: n,
        severity: "error",
        code: "INVALID_ANSWER_KEY",
        message: `Answer key "${question.answer.correctKey}" not in options [${optionKeys.join(", ")}]`,
      });
    }
  }

  // Missing explanation is a warning, not an error
  if (!question.explanation) {
    issues.push({ questionNumber: n, severity: "warning", code: "MISSING_EXPLANATION", message: "No explanation provided" });
  }

  // Flag questions the parser marked for review
  if (question.needsReview) {
    issues.push({
      questionNumber: n,
      severity: "error",
      code: "NEEDS_REVIEW",
      message: question.reviewNote ?? "Question flagged for human review",
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function validateParsedQuestionSet(
  parsed: ParsedQuestionSet,
  filePath: string,
): ValidationReport {
  const issues: ValidationIssue[] = [];

  for (const question of parsed.questions) {
    validateQuestionBusinessRules(question, issues);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const needsReview = parsed.questions.filter((q) => q.needsReview).length;
  const validQuestions = parsed.questions.length - errors.filter((e) => e.questionNumber !== "frontmatter").length;

  return {
    filePath,
    valid: errors.length === 0,
    totalQuestions: parsed.questions.length,
    validQuestions: Math.max(0, validQuestions),
    needsReview,
    issues,
  };
}

export function formatReport(report: ValidationReport): string {
  const lines: string[] = [
    `Content Agent Report`,
    `────────────────────`,
    `File: ${report.filePath}`,
    `Questions found: ${report.totalQuestions}`,
    `Valid: ${report.validQuestions}`,
    `Needs review: ${report.needsReview}`,
    `Status: ${report.valid ? "✅ VALID" : "❌ INVALID"}`,
    ``,
  ];

  if (report.issues.length > 0) {
    lines.push("Issues:");
    for (const issue of report.issues) {
      const prefix = issue.severity === "error" ? "  ✗" : "  ⚠";
      const qLabel = issue.questionNumber === "frontmatter" ? "frontmatter" : `Q${issue.questionNumber}`;
      lines.push(`${prefix} [${qLabel}] ${issue.code}: ${issue.message}`);
    }
  }

  return lines.join("\n");
}
