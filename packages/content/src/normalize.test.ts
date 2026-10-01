import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentHash, NORMALIZATION_VERSION, normalizeQuestionText } from "./normalize.ts";

// The cases the Python implementation generated (apps/pipeline/prepora_pipeline/dedupe/
// fixtures/normalization.json): this port must agree with it on every one.
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../../apps/pipeline/prepora_pipeline/dedupe/fixtures/normalization.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  version: number;
  cases: { name: string; input: string; normalized: string; hash: string }[];
};

describe("normalization, shared with the pipeline", () => {
  it("is the same version", () => {
    expect(NORMALIZATION_VERSION).toBe(fixtures.version);
  });

  for (const c of fixtures.cases) {
    it(`matches the pipeline: ${c.name}`, () => {
      expect(normalizeQuestionText(c.input)).toBe(c.normalized);
      expect(contentHash(c.input)).toBe(c.hash);
    });
  }
});
