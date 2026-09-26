import { describe, expect, it } from "vitest";
import { explanationWithReadingLinks } from "./reading-links.js";

const scraped =
  "Rationale:\nBecause.\n\nObjective:\n3.1 Align an AI strategy\n\nAdditional Reading:\nArtificial Intelligence overview";
const link = {
  text: "Artificial Intelligence overview",
  url: "https://learn.microsoft.com/en-us/compliance/assurance/assurance-artificial-intelligence",
};

describe("explanationWithReadingLinks", () => {
  it("turns a matching title line into a Markdown link, leaving the rest untouched", () => {
    expect(explanationWithReadingLinks(scraped, [link])).toBe(
      `Rationale:\nBecause.\n\nObjective:\n3.1 Align an AI strategy\n\nAdditional Reading:\n[Artificial Intelligence overview](${link.url})`,
    );
  });

  it("keeps a section that is followed by another labelled section in place", () => {
    const text = "Additional Reading:\nArtificial Intelligence overview\nObjective:\n1.1 Thing";
    expect(explanationWithReadingLinks(text, [link])).toBe(
      `Additional Reading:\n[Artificial Intelligence overview](${link.url})\nObjective:\n1.1 Thing`,
    );
  });

  it("appends links whose titles aren't listed, and adds a section when there is none", () => {
    expect(explanationWithReadingLinks("Rationale:\nBecause.", [link])).toBe(
      `Rationale:\nBecause.\n\nAdditional Reading:\n[Artificial Intelligence overview](${link.url})`,
    );
  });

  it("never links a non-http(s) URL", () => {
    expect(
      explanationWithReadingLinks(scraped, [{ text: link.text, url: "javascript:alert(1)" }]),
    ).toBe(scraped);
  });

  it("returns the explanation unchanged when there are no links", () => {
    expect(explanationWithReadingLinks(scraped, [])).toBe(scraped);
    expect(explanationWithReadingLinks(null, undefined)).toBeNull();
  });
});
