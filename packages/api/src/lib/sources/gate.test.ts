import { describe, expect, it } from "vitest";
import { reviewQualityIssues } from "../review-quality.js";
import { gateQualityChecks } from "./gate.js";

const QP = "https://gate2026.iitg.ac.in/doc/download/2026/QPs/CS1.pdf";

describe("GATE review checks", () => {
  it("applies to GATE batches only", () => {
    expect(gateQualityChecks.appliesTo(QP)).toBe(true);
    expect(gateQualityChecks.appliesTo("https://gate2026.iitg.ac.in.evil.test/x")).toBe(false);
    expect(gateQualityChecks.appliesTo("https://learn.microsoft.com/x")).toBe(false);
  });

  it("reports a question without marks, and nothing for complete NAT or MTA questions", () => {
    const elements = [
      {
        questionText: "Invented NAT?",
        options: [],
        answer: "4.24 to 4.26",
        normalized: { marks: 2 },
      },
      {
        questionText: "Invented MTA?",
        options: ["a", "b"],
        answer: "Marks to all",
        normalized: { marks: 1 },
      },
      { questionText: "No marks?", options: ["a", "b"], answer: "A", normalized: { marks: null } },
    ];
    expect(reviewQualityIssues(elements, QP)).toEqual([
      expect.objectContaining({ code: "missing_marks", count: 1 }),
    ]);
  });
});
