import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublishingAvailable,
  assertScrapingAvailable,
  publishingLockReason,
  scrapingLockReason,
} from "./local-only-services.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("local-only services (scraping, publishing)", () => {
  it("both are available in local development and tests", () => {
    for (const env of ["development", "test"]) {
      process.env.NODE_ENV = env;
      delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
      expect(scrapingLockReason()).toBeNull();
      expect(publishingLockReason()).toBeNull();
      expect(() => assertScrapingAvailable()).not.toThrow();
      expect(() => assertPublishingAvailable()).not.toThrow();
    }
  });

  it("both are locked in production, each with its own explanation", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(scrapingLockReason()).toMatch(/Scraping runs only in local development/);
    expect(publishingLockReason()).toMatch(
      /pipeline service, which runs only in local development/,
    );
    expect(() => assertScrapingAvailable()).toThrow(/Scraping runs only/);
    expect(() => assertPublishingAvailable()).toThrow(/pipeline service/);
  });

  it("fails closed when NODE_ENV isn't set (a deployed Worker may not have it)", () => {
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(scrapingLockReason()).not.toBeNull();
    expect(publishingLockReason()).not.toBeNull();
  });

  it("both locks can be lifted explicitly for a build with the services running next to it", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_LOCAL_ONLY_SCRAPERS = "true";
    expect(scrapingLockReason()).toBeNull();
    expect(publishingLockReason()).toBeNull();
  });
});
