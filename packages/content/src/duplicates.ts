import type { Question } from "./schema.ts";

// ─── Simple content hash for exact duplicate detection ────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

export function contentHash(questionText: string): string {
  const normalized = normalizeText(questionText);
  // Simple djb2 hash (deterministic, no crypto needed)
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash = hash >>> 0; // convert to unsigned 32-bit
  }
  return hash.toString(36);
}

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
    if (hashes.has(hash)) {
      candidates.push({
        questionA: { number: hashes.get(hash)!, text: q.questionText },
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
    normalized: normalizeText(q.questionText),
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
