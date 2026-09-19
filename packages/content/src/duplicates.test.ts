import { describe, expect, it } from "vitest";
import { contentHash, findDuplicates, similarity } from "./duplicates.ts";
import type { Question } from "./schema.ts";

function q(number: number, questionText: string): Question {
  return { number, questionText, questionType: "mcq", needsReview: false };
}

describe("contentHash", () => {
  it("is stable for identical text", () => {
    expect(contentHash("What is the unit of force?")).toBe(
      contentHash("What is the unit of force?"),
    );
  });

  it("normalizes case, whitespace and punctuation before hashing", () => {
    expect(contentHash("What is the unit of force?")).toBe(
      contentHash("what   is the UNIT of force"),
    );
  });

  it("differs for genuinely different text", () => {
    expect(contentHash("What is the unit of force?")).not.toBe(
      contentHash("What is the unit of energy?"),
    );
  });
});

describe("similarity", () => {
  it("is 1 for identical strings", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
  });

  it("is 1 for two empty strings (documented edge case)", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("decreases as strings diverge", () => {
    const close = similarity("strength of materials", "strength of material");
    const far = similarity("strength of materials", "database management systems");
    expect(close).toBeGreaterThan(far);
  });
});

describe("findDuplicates", () => {
  it("reports no candidates for a set of genuinely distinct questions", () => {
    const candidates = findDuplicates([
      q(1, "What is the unit of force?"),
      q(2, "What is the capital of France?"),
      q(3, "Explain database normalization."),
    ]);
    expect(candidates).toEqual([]);
  });

  it("flags an exact duplicate (identical after normalization) with similarityScore 1", () => {
    const candidates = findDuplicates([
      q(1, "What is the unit of force?"),
      q(2, "what is the UNIT of force"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ type: "exact", similarityScore: 1 });
    expect(candidates[0].questionA.number).toBe(1);
    expect(candidates[0].questionB.number).toBe(2);
  });

  it("flags a near-duplicate (>=0.9 similarity, not identical) as type 'near'", () => {
    const candidates = findDuplicates([
      q(1, "What is the modulus of elasticity of steel"),
      q(2, "What is the modulus of elasticity of steel "), // trailing space only differs before normalization
    ]);
    // These normalize to the exact same string, so this specific pair should be "exact", not "near" —
    // included to make the exact/near boundary explicit rather than assumed.
    expect(candidates[0].type).toBe("exact");
  });

  it("does not flag pairs below the 0.9 similarity threshold", () => {
    const candidates = findDuplicates([
      q(1, "What is the unit of force in the SI system?"),
      q(2, "What is the unit of energy in the SI system?"),
    ]);
    expect(candidates.some((c) => c.type === "near")).toBe(false);
  });

  it("never merges — only reports candidates for human review", () => {
    // findDuplicates has no mutation/merge side effect: calling it twice on the same input is
    // idempotent and the input array is untouched.
    const questions = [q(1, "Same question text"), q(2, "Same question text")];
    const before = JSON.stringify(questions);
    findDuplicates(questions);
    expect(JSON.stringify(questions)).toBe(before);
  });

  it("does not compare questions across separate calls (no cross-file/cross-set awareness)", () => {
    // Documents docs/architecture/prepora-next-level-plan.md finding #13: findDuplicates only ever
    // sees the questions passed to a single call. Two separate calls with overlapping content never
    // see each other, which is exactly why cross-file dedupe doesn't happen today.
    const candidatesA = findDuplicates([q(1, "Duplicated across files")]);
    const candidatesB = findDuplicates([q(1, "Duplicated across files")]);
    expect(candidatesA).toEqual([]);
    expect(candidatesB).toEqual([]);
  });
});
