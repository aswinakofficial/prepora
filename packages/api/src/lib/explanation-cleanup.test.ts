import { describe, expect, it } from "vitest";
import { stripScraperBoilerplate } from "./explanation-cleanup.js";

describe("stripScraperBoilerplate", () => {
  it("removes the line from inside a rationale, keeping the sections intact", () => {
    const stored =
      "Rationale:\nCopilot grounds responses in the workbook.\nExtracted directly from Microsoft Learn Practice Assessment.\n\nObjective:\n1.1 Understand generative AI\n\nAdditional Reading:\nApplication card";
    expect(stripScraperBoilerplate(stored)).toBe(
      "Rationale:\nCopilot grounds responses in the workbook.\n\nObjective:\n1.1 Understand generative AI\n\nAdditional Reading:\nApplication card",
    );
  });

  it("turns a placeholder-only explanation into no explanation", () => {
    expect(
      stripScraperBoilerplate("Extracted directly from Microsoft Learn Practice Assessment."),
    ).toBeNull();
    expect(
      stripScraperBoilerplate(
        "Rationale:\nExtracted directly from Microsoft Learn Practice Assessment.",
      ),
    ).toBeNull();
    expect(
      stripScraperBoilerplate(
        "Extracted directly from Microsoft Learn (https://learn.microsoft.com/x)",
      ),
    ).toBeNull();
  });

  it("leaves real explanations and ordinary mentions alone", () => {
    const text = "Rationale:\nThe data was extracted directly from the source table.";
    expect(stripScraperBoilerplate(text)).toBe(text);
    expect(stripScraperBoilerplate(null)).toBeNull();
  });
});
