import { contentHash, normalizeQuestionText } from "./normalize.ts";
import type { Question } from "./schema.ts";

// ─── Content hash for exact duplicate detection ───────────────────────────────
// The same normalization and hash the pipeline publishes with (./normalize.ts).

export { contentHash } from "./normalize.ts";

// ─── Levenshtein distance for near-duplicate detection ────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

export interface DuplicateCandidate {
  questionA: { number: number; text: string };
  questionB: { number: number; text: string };
  type: "exact" | "near";
  similarityScore: number;
}

/**
 * Find potential duplicate questions within a set.
 * Returns exact duplicates (hash match) and near-duplicates (>90% similarity).
 * NEVER auto-merges — just reports for human review.
 */
export function findDuplicates(questions: Question[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const hashes = new Map<string, number>();

  for (const q of questions) {
    const hash = contentHash(q.questionText);
    const existingNumber = hashes.get(hash);
    if (existingNumber !== undefined) {
      candidates.push({
        questionA: { number: existingNumber, text: q.questionText },
        questionB: { number: q.number, text: q.questionText },
        type: "exact",
        similarityScore: 1,
      });
    } else {
      hashes.set(hash, q.number);
    }
  }

  // Near-duplicate check (O(n²), acceptable for typical paper sizes < 200 questions)
  const texts = questions.map((q) => ({
    number: q.number,
    normalized: normalizeQuestionText(q.questionText),
  }));

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const sim = similarity(texts[i].normalized, texts[j].normalized);
      if (sim >= 0.9 && sim < 1) {
        candidates.push({
          questionA: { number: texts[i].number, text: questions[i].questionText },
          questionB: { number: texts[j].number, text: questions[j].questionText },
          type: "near",
          similarityScore: sim,
        });
      }
    }
  }

  return candidates;
}
