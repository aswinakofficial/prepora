import { describe, expect, it } from "vitest";
import { diffWords } from "./word-diff";

const changed = (tokens: { text: string; kind: string }[], kind: string) =>
  tokens.filter((t) => t.kind === kind).map((t) => t.text);

describe("diffWords", () => {
  it("highlights a single reworded word on each side", () => {
    const { existing, candidate } = diffWords(
      "What's the appropriate repository permission role for contributors?",
      "What's the appropriate repository permission level for contributors?",
    );
    expect(changed(existing, "removed")).toEqual(["role"]);
    expect(changed(candidate, "added")).toEqual(["level"]);
  });

  it("catches a changed number — the difference that makes it a different question", () => {
    const { existing, candidate } = diffWords(
      "What are the two types of GitHub Actions?",
      "What are the three types of GitHub Actions?",
    );
    expect(changed(existing, "removed")).toEqual(["two"]);
    expect(changed(candidate, "added")).toEqual(["three"]);
  });

  it("handles insertions and contractions", () => {
    const { existing, candidate } = diffWords(
      "What is the best reason to upgrade?",
      "What's the single best reason to upgrade?",
    );
    expect(changed(existing, "removed")).toEqual(["What", "is"]);
    expect(changed(candidate, "added")).toEqual(["What's", "single"]);
  });

  it("ignores case and trailing punctuation, and preserves the text exactly", () => {
    const a = "Which technology would you enable";
    const b = "which technology would you enable?";
    const { existing, candidate } = diffWords(a, b);
    expect(changed(existing, "removed")).toEqual([]);
    expect(changed(candidate, "added")).toEqual([]);
    expect(existing.map((t) => t.text).join("")).toBe(a);
    expect(candidate.map((t) => t.text).join("")).toBe(b);
  });
});
