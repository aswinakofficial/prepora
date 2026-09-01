import { z } from "zod";

// ─── Frontmatter schema ───────────────────────────────────────────────────────

export const QuestionSetFrontmatterSchema = z.object({
  id: z.string().min(1, "Stable content ID is required"),
  exam: z.string().min(1, "exam slug is required"),
  exam_variant: z.string().min(1, "exam_variant slug is required"),
  year: z.number().int().min(1900).max(2100).optional(),
  subject: z.string().min(1, "subject slug is required"),
  title: z.string().min(1, "title is required"),
  source_type: z
    .enum(["official", "user_submitted", "editorial", "generated", "unknown"])
    .optional()
    .default("official"),
  source_url: z.string().url().optional(),
  source_document: z.string().optional(),
});

export type QuestionSetFrontmatter = z.infer<typeof QuestionSetFrontmatterSchema>;

// ─── Question option ──────────────────────────────────────────────────────────

export const QuestionOptionSchema = z.object({
  key: z.string().regex(/^[A-Za-z]$/, "Option key must be a single letter"),
  text: z.string().min(1, "Option text is required"),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

// ─── Answer schema ────────────────────────────────────────────────────────────

export const MCQAnswerSchema = z.object({
  type: z.literal("mcq"),
  correctKey: z
    .string()
    .regex(/^[A-Za-z]$/, "Correct key must be a single letter"),
});

export const MultipleCorrectAnswerSchema = z.object({
  type: z.literal("multiple_correct"),
  correctKeys: z
    .array(z.string().regex(/^[A-Za-z]$/))
    .min(1, "At least one correct key required"),
});

export const TextAnswerSchema = z.object({
  type: z.literal("text"),
  answer: z.string().min(1),
});

export const NumericalAnswerSchema = z.object({
  type: z.literal("numerical"),
  answer: z.string().min(1),
});

export const AnswerSchema = z.discriminatedUnion("type", [
  MCQAnswerSchema,
  MultipleCorrectAnswerSchema,
  TextAnswerSchema,
  NumericalAnswerSchema,
]);

export type Answer = z.infer<typeof AnswerSchema>;

// ─── Canonical question schema ────────────────────────────────────────────────

export const QuestionSchema = z.object({
  number: z.number().int().positive(),
  questionText: z.string().min(1, "Question text is required"),
  questionType: z
    .enum([
      "mcq",
      "multiple_correct",
      "true_false",
      "fill_blank",
      "descriptive",
      "numerical",
      "assertion_reason",
      "match_following",
    ])
    .default("mcq"),
  options: z.array(QuestionOptionSchema).optional(),
  answer: AnswerSchema.optional(),
  explanation: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard", "expert"]).optional(),
  tags: z.array(z.string()).optional(),
  // Flag set by parser when answer is ambiguous/missing
  needsReview: z.boolean().optional().default(false),
  reviewNote: z.string().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

// ─── Parsed question set ──────────────────────────────────────────────────────

export const ParsedQuestionSetSchema = z.object({
  frontmatter: QuestionSetFrontmatterSchema,
  questions: z.array(QuestionSchema),
});

export type ParsedQuestionSet = z.infer<typeof ParsedQuestionSetSchema>;

// ─── Validation report ────────────────────────────────────────────────────────

export interface ValidationIssue {
  questionNumber: number | "frontmatter";
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationReport {
  filePath: string;
  valid: boolean;
  totalQuestions: number;
  validQuestions: number;
  needsReview: number;
  issues: ValidationIssue[];
}
