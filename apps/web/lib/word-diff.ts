// Word-level difference between two versions of a question, for the review page's side-by-side
// duplicate view: which words the existing question has that the new one doesn't ("role"), and
// which the new one adds ("level"). Comparison ignores case and surrounding punctuation, so
// "What's" vs "What is" shows as a real change but "Actions?" vs "Actions" doesn't.

export interface DiffToken {
  text: string;
  /** "same" in both; "removed" only in the existing question; "added" only in the new one. */
  kind: "same" | "removed" | "added";
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

function comparable(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Tokens for each side: `existing` marks words missing from the new version as "removed",
 *  `candidate` marks words the new version adds as "added". Whitespace is kept as "same". */
export function diffWords(
  existing: string,
  candidate: string,
): { existing: DiffToken[]; candidate: DiffToken[] } {
  const a = tokenize(existing);
  const b = tokenize(candidate);
  const words = (tokens: string[]) =>
    tokens.map((t, i) => ({ t, i })).filter(({ t }) => !/^\s+$/.test(t));
  const aw = words(a);
  const bw = words(b);

  // Longest common subsequence over words (questions are short; O(n·m) is fine).
  const lcs: number[][] = Array.from({ length: aw.length + 1 }, () =>
    new Array<number>(bw.length + 1).fill(0),
  );
  for (let i = aw.length - 1; i >= 0; i--) {
    for (let j = bw.length - 1; j >= 0; j--) {
      lcs[i][j] =
        comparable(aw[i].t) === comparable(bw[j].t)
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const aSame = new Set<number>();
  const bSame = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < aw.length && j < bw.length) {
    if (comparable(aw[i].t) === comparable(bw[j].t)) {
      aSame.add(aw[i].i);
      bSame.add(bw[j].i);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const mark = (tokens: string[], same: Set<number>, changed: DiffToken["kind"]) =>
    tokens.map(
      (text, index): DiffToken => ({
        text,
        kind: /^\s+$/.test(text) || same.has(index) ? "same" : changed,
      }),
    );
  return { existing: mark(a, aSame, "removed"), candidate: mark(b, bSame, "added") };
}
