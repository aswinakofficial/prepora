import { describe, expect, it } from "vitest";
import { reviewQualityIssues } from "./review-quality.js";

const MS_LEARN =
  "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-104/practice/assessment";

const good = {
  questionText: "What should you configure?",
  options: ["A thing", "Another thing"],
  answer: "A thing",
  explanation: "Rationale:\nBecause.",
  additionalReadingLinks: [
    {
      text: "Azure virtual network traffic routing",
      url: "https://learn.microsoft.com/azure/virtual-network/virtual-networks-udr-overview",
    },
  ],
};

const broken = {
  questionText: "What should you configure?\n\nAzure Firewall policy rule sets | Microsoft Learn",
  options: ["A thing", "Another thing"],
  answer: "Neither",
  explanation: "Extracted directly from Microsoft Learn Practice Assessment.",
  additionalReadingLinks: [
    { text: "All training", url: "https://learn.microsoft.com/en-us/training/" },
  ],
};

describe("reviewQualityIssues", () => {
  it("reports nothing for a clean batch", () => {
    expect(reviewQualityIssues([good, good], MS_LEARN)).toEqual([]);
  });

  it("flags each known extraction failure of the batch's source, with a count", () => {
    expect(reviewQualityIssues([good, broken], MS_LEARN).map((i) => [i.code, i.count])).toEqual([
      ["placeholder_explanation", 1],
      ["page_title_in_question", 1],
      ["site_menu_links", 1],
      ["answer_not_in_options", 1],
    ]);
    expect(reviewQualityIssues([good, broken], MS_LEARN)[0].message).toBe(
      "1 of 2 questions have a placeholder instead of the real explanation",
    );
  });

  it("applies a source's own checks only to batches from that source", () => {
    for (const other of ["https://www.indiabix.com/aptitude/", null, undefined]) {
      expect(reviewQualityIssues([good, broken], other).map((i) => i.code)).toEqual([
        "answer_not_in_options",
      ]);
    }
  });

  it("doesn't flag a question published without a rationale", () => {
    expect(reviewQualityIssues([good, { ...good, explanation: null }], MS_LEARN)).toEqual([]);
  });
});
