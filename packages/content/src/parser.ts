import matter from "gray-matter";
import type {
  ParsedQuestionSet,
  Question,
  QuestionOption,
  Answer,
} from "./schema.ts";
import { QuestionSetFrontmatterSchema } from "./schema.ts";

// ─── Markdown parser helpers ──────────────────────────────────────────────────

/**
 * Parse a single option line like "- A. Some text" or "- A) Some text"
 */
function parseOptionLine(line: string): QuestionOption | null {
  const match = line.match(/^[-*]\s*([A-Za-z])[.)]\s+(.+)$/);
  if (!match) return null;
  return { key: match[1].toUpperCase(), text: match[2].trim() };
}

/**
 * Parse an answer line like "**Answer:** B" or "**Answer:** A, C"
 */
function parseAnswerLine(line: string): Answer | null {
  const match = line.match(/\*{0,2}Answer[:\s]*\*{0,2}:?\s*(.+)/i);
  if (!match) return null;
  const raw = match[1].trim();
  // Multiple correct: "A, C" or "A and C"
  if (raw.includes(",") || /\band\b/i.test(raw)) {
    const keys = raw
      .split(/[,\s]+and\s+|,\s*/)
      .map((k) => k.trim().toUpperCase())
      .filter((k) => /^[A-Z]$/.test(k));
    if (keys.length > 1)
      return { type: "multiple_correct", correctKeys: keys };
  }
  // Single letter MCQ
  if (/^[A-Za-z]$/.test(raw))
    return { type: "mcq", correctKey: raw.toUpperCase() };
  // Numerical
  if (/^[-\d.]+$/.test(raw)) return { type: "numerical", answer: raw };
  // Text fallback
  return { type: "text", answer: raw };
}

/**
 * Extract explanation following "**Explanation:**" until next heading or HR
 */
function extractExplanation(lines: string[], fromIndex: number): string {
  const parts: string[] = [];
  for (let i = fromIndex; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#") || l.startsWith("---") || l.startsWith("**Answer")) break;
    parts.push(l);
  }
  return parts.join("\n").trim();
}

// ─── Main question block parser ───────────────────────────────────────────────

function parseQuestionBlock(rawLines: string[], questionNumber: number): Question {
  const lines = rawLines.map((l) => l.trim());
  const questionTextLines: string[] = [];
  const options: QuestionOption[] = [];
  let answer: Answer | undefined;
  let explanation: string | undefined;
  let topic: string | undefined;
  let difficulty: Question["difficulty"];
  let needsReview = false;
  let reviewNote: string | undefined;

  let mode: "question" | "options" | "explanation" | "topic" = "question";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) {
      if (mode === "question") continue;
      continue;
    }

    // Answer line
    const answerMatch = line.match(/^\*{0,2}Answer[:\s*]*\*{0,2}:?\s*(.+)/i);
    if (answerMatch) {
      const parsed = parseAnswerLine(line);
      if (parsed) {
        answer = parsed;
      } else {
        needsReview = true;
        reviewNote = `Could not parse answer: "${line}"`;
      }
      mode = "explanation";
      continue;
    }

    // Explanation line
    if (line.match(/^\*{0,2}Explanation[:\s*]*\*{0,2}:?\s*/i)) {
      mode = "explanation";
      const inline = line.replace(/^\*{0,2}Explanation[:\s*]*\*{0,2}:?\s*/i, "").trim();
      if (inline) explanation = inline;
      continue;
    }

    // Topic line
    if (line.match(/^\*{0,2}Topic[:\s*]*\*{0,2}:?\s*/i)) {
      topic = line.replace(/^\*{0,2}Topic[:\s*]*\*{0,2}:?\s*/i, "").trim();
      continue;
    }

    // Difficulty line
    if (line.match(/^\*{0,2}Difficulty[:\s*]*\*{0,2}:?\s*/i)) {
      const d = line
        .replace(/^\*{0,2}Difficulty[:\s*]*\*{0,2}:?\s*/i, "")
        .trim()
        .toLowerCase() as Question["difficulty"];
      if (["easy", "medium", "hard", "expert"].includes(d!)) difficulty = d;
      continue;
    }

    // Option line
    const option = parseOptionLine(line);
    if (option) {
      options.push(option);
      mode = "options";
      continue;
    }

    // Explanation continuation
    if (mode === "explanation") {
      explanation = explanation ? `${explanation}\n${line}` : line;
      continue;
    }

    // Question text
    if (mode === "question") {
      questionTextLines.push(line);
    }
  }

  // Validate answer references options
  if (answer?.type === "mcq" && options.length > 0) {
    const optionKeys = options.map((o) => o.key);
    if (!optionKeys.includes(answer.correctKey)) {
      needsReview = true;
      reviewNote = `Answer key "${answer.correctKey}" not in options [${optionKeys.join(", ")}]`;
    }
  }

  if (!answer) {
    needsReview = true;
    reviewNote = reviewNote ?? "No answer found";
  }

  return {
    number: questionNumber,
    questionText: questionTextLines.join("\n").trim(),
    questionType: options.length > 0 ? "mcq" : "descriptive",
    options: options.length > 0 ? options : undefined,
    answer,
    explanation: explanation?.trim(),
    topic,
    difficulty,
    needsReview,
    reviewNote,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult {
  data: ParsedQuestionSet | null;
  errors: string[];
}

/**
 * Parse a Prepora-format Markdown string into a structured ParsedQuestionSet.
 * Returns errors if frontmatter validation fails; partial question data when
 * individual question blocks have issues (flagged as needsReview).
 */
export function parsePreporaMarkdown(markdown: string, filePath = "<input>"): ParseResult {
  const errors: string[] = [];

  // 1. Parse frontmatter
  let frontmatterRaw: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(markdown);
    frontmatterRaw = parsed.data;
    content = parsed.content;
  } catch (e) {
    return { data: null, errors: [`Failed to parse frontmatter: ${(e as Error).message}`] };
  }

  const frontmatterResult = QuestionSetFrontmatterSchema.safeParse(frontmatterRaw);
  if (!frontmatterResult.success) {
    const issues = frontmatterResult.error.issues.map(
      (i) => `Frontmatter: ${i.path.join(".")} — ${i.message}`,
    );
    return { data: null, errors: issues };
  }

  // 2. Split content into question blocks by H1 headings
  const questionBlocks: { number: number; lines: string[] }[] = [];
  const allLines = content.split("\n");
  let currentBlock: string[] = [];
  let currentNumber = 0;

  for (const line of allLines) {
    const heading = line.match(/^#\s+Question\s+(\d+)/i);
    if (heading) {
      if (currentBlock.length > 0 && currentNumber > 0) {
        questionBlocks.push({ number: currentNumber, lines: currentBlock });
      }
      currentNumber = parseInt(heading[1], 10);
      currentBlock = [];
    } else if (line.trim() === "---") {
      // HR as question separator
      if (currentBlock.length > 0 && currentNumber > 0) {
        questionBlocks.push({ number: currentNumber, lines: currentBlock });
        currentBlock = [];
        currentNumber++;
      }
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0 && currentNumber > 0) {
    questionBlocks.push({ number: currentNumber, lines: currentBlock });
  }

  if (questionBlocks.length === 0) {
    errors.push("No questions found in content");
    return { data: null, errors };
  }

  // 3. Parse each block
  const questions = questionBlocks.map(({ number, lines }) =>
    parseQuestionBlock(lines, number),
  );

  return {
    data: {
      frontmatter: frontmatterResult.data,
      questions,
    },
    errors,
  };
}
