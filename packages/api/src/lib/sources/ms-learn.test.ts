import { describe, expect, it } from "vitest";
import { isSiteMenuLink, msLearnQualityChecks } from "./ms-learn.js";

describe("isSiteMenuLink", () => {
  it("recognises Microsoft Learn's header menu links", () => {
    for (const url of [
      "https://learn.microsoft.com/en-us/",
      "https://learn.microsoft.com/en-us/docs/",
      "https://learn.microsoft.com/en-us/credentials/",
      "https://learn.microsoft.com/en-us/answers/",
      "https://learn.microsoft.com/en-us/azure/?product=popular",
      "https://learn.microsoft.com/en-us/dotnet/?products=dotnet",
      "https://learn.microsoft.com/en-us/training/",
      "https://learn.microsoft.com/en-us/training/browse/?products=azure",
    ]) {
      expect(isSiteMenuLink(url), url).toBe(true);
    }
  });

  it("leaves real reading resources alone", () => {
    for (const url of [
      "https://learn.microsoft.com/training/modules/design-implement-private-access-to-azure-services/",
      "https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns",
      // Product documentation homes, which rationales do cite ("Power Automate documentation").
      "https://learn.microsoft.com/power-automate/",
      "https://learn.microsoft.com/en-us/power-platform/",
      "https://learn.microsoft.com/en-us/purview/",
      "https://learn.microsoft.com/en-us/azure/",
      "https://example.com/en-us/docs/",
    ]) {
      expect(isSiteMenuLink(url), url).toBe(false);
    }
    expect(isSiteMenuLink(undefined)).toBe(false);
  });
});

describe("msLearnQualityChecks", () => {
  it("applies to Microsoft Learn batches only", () => {
    expect(msLearnQualityChecks.appliesTo("https://learn.microsoft.com/en-us/x")).toBe(true);
    expect(msLearnQualityChecks.appliesTo("https://learn.microsoft.com.evil.com/x")).toBe(false);
    expect(msLearnQualityChecks.appliesTo("https://www.indiabix.com/x")).toBe(false);
    expect(msLearnQualityChecks.appliesTo("not a url")).toBe(false);
  });
});
