import { describe, expect, it } from "vitest";
import { countNewQuestions, normalizeQuestionText } from "./review-dedupe.js";

describe("countNewQuestions", () => {
  it("counts what the exam doesn't have yet, ignoring case, spacing and punctuation", () => {
    const existing = [
      "What does Azure Firewall inspect by default?",
      "Which rule filters by FQDN?",
    ];
    const batch = [
      "what does azure firewall   inspect by default", // already in the exam
      "Where are NSG flow logs stored?", // new
      "Where are NSG flow logs stored?", // repeated within the batch — counted once
      "Which rule filters by FQDN?", // already in the exam
    ];
    expect(countNewQuestions(batch, existing)).toEqual({ newCount: 1, existingCount: 2 });
  });

  it("treats everything as new for an exam with no questions yet", () => {
    expect(countNewQuestions(["A?", "B?"], [])).toEqual({ newCount: 2, existingCount: 0 });
  });

  it("normalizes exactly like the pipeline (Unicode letters kept, same step order)", () => {
    // Python: " ".join("café — naïve?".lower().split()) -> "café — naïve?", then dropping
    // non-alphanumerics leaves the two spaces around the dash: "café  naïve".
    expect(normalizeQuestionText("Café — naïve?")).toBe("café  naïve");
  });
});
