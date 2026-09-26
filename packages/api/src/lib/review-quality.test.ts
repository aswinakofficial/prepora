import { describe, expect, it } from "vitest";
import { isSiteMenuLink, reviewQualityIssues } from "./review-quality.js";

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

describe("isSiteMenuLink", () => {
  it("recognises Microsoft Learn's header menu links", () => {
    for (const url of [
      "https://learn.microsoft.com/en-us/docs/",
      "https://learn.microsoft.com/en-us/azure/?product=popular",
      "https://learn.microsoft.com/en-us/training/",
      "https://learn.microsoft.com/en-us/training/browse/?products=azure",
    ]) {
      expect(isSiteMenuLink(url)).toBe(true);
    }
  });

  it("leaves real reading resources alone", () => {
    expect(
      isSiteMenuLink(
        "https://learn.microsoft.com/training/modules/design-implement-private-access-to-azure-services/",
      ),
    ).toBe(false);
    expect(
      isSiteMenuLink("https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns"),
    ).toBe(false);
    expect(isSiteMenuLink(undefined)).toBe(false);
  });
});

describe("reviewQualityIssues", () => {
  it("reports nothing for a clean batch", () => {
    expect(reviewQualityIssues([good, good])).toEqual([]);
  });

  it("flags each known extraction failure with a count", () => {
    const broken = {
      questionText:
        "What should you configure?\n\nAzure Firewall policy rule sets | Microsoft Learn",
      options: ["A thing", "Another thing"],
      answer: "Neither",
      explanation: "Extracted directly from Microsoft Learn Practice Assessment.",
      additionalReadingLinks: [
        { text: "All training", url: "https://learn.microsoft.com/en-us/training/" },
      ],
    };
    expect(reviewQualityIssues([good, broken]).map((i) => [i.code, i.count])).toEqual([
      ["placeholder_explanation", 1],
      ["page_title_in_question", 1],
      ["site_menu_links", 1],
      ["answer_not_in_options", 1],
    ]);
    expect(reviewQualityIssues([good, broken])[0].message).toBe(
      "1 of 2 questions have a placeholder instead of the real explanation",
    );
  });

  it("doesn't flag a question published without a rationale", () => {
    expect(reviewQualityIssues([good, { ...good, explanation: null }])).toEqual([]);
  });
});
