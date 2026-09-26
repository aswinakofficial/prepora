import { describe, expect, it } from "vitest";
import { answerKeysForReviewElement } from "./review-answers.js";

const options = ["Search for keywords.", "View Copilot memory.", "Review the chat history."];

describe("answerKeysForReviewElement", () => {
  it("maps a single answer to its option key", () => {
    expect(answerKeysForReviewElement({ options, answer: "View Copilot memory." })).toEqual(["B"]);
  });

  it("matches ignoring surrounding whitespace, repeated spaces and case", () => {
    expect(answerKeysForReviewElement({ options, answer: "  view  copilot MEMORY. " })).toEqual([
      "B",
    ]);
  });

  it("splits a ' | '-joined multi-answer into sorted keys", () => {
    expect(
      answerKeysForReviewElement({
        options,
        answer: "Review the chat history. | Search for keywords.",
      }),
    ).toEqual(["A", "C"]);
  });

  it("prefers an exact whole-answer match when an option itself contains ' | '", () => {
    expect(answerKeysForReviewElement({ options: ["A | B", "A", "B"], answer: "A | B" })).toEqual([
      "A",
    ]);
  });

  it("throws instead of inventing a key when an answer matches no option", () => {
    expect(() =>
      answerKeysForReviewElement({ options, answer: "Search for keywords. | Ask a colleague." }),
    ).toThrow(/Ask a colleague/);
  });
});
