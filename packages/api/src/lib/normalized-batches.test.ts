import { describe, expect, it } from "vitest";
import { isNormalizedBatch, normalizedElements } from "./normalized-batches.ts";

describe("normalized-v1 review batches", () => {
  it("is recognised by its metadata's format", () => {
    expect(isNormalizedBatch({ format: "normalized-v1" })).toBe(true);
    expect(isNormalizedBatch({ exam: "AZ-900" })).toBe(false);
    expect(isNormalizedBatch(null)).toBe(false);
  });

  it("publishes each element's normalized question as it is, numbered as in its paper", () => {
    const normalized = { exam_slug: "gate", number: 11, marks: 1, section: "CS" };
    const { publishable, failed } = normalizedElements([
      { questionText: "Display text, never published", answer: "Z", normalized },
    ]);
    expect(failed).toEqual([]);
    expect(publishable).toHaveLength(1);
    expect(publishable[0].normalized).toBe(normalized); // the same object, untouched
    expect(publishable[0].number).toBe(11);
  });

  it("fails an element without normalized data, with a clear reason", () => {
    const { publishable, failed } = normalizedElements([
      { questionText: "An invented question" },
      { questionText: "Another", normalized: { number: 2 } },
    ]);
    expect(publishable.map((p) => p.number)).toEqual([2]);
    expect(failed).toEqual([
      {
        number: 1,
        preview: "An invented question",
        reason: "This batch's format is normalized-v1, but the question has no `normalized` data.",
      },
    ]);
  });
});
