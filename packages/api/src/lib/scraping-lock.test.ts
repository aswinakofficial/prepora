import { afterEach, describe, expect, it } from "vitest";
import { assertScrapingAvailable, scrapingLockReason } from "./scraping-lock.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("scraping lock", () => {
  it("scraping is available in local development and tests", () => {
    for (const env of ["development", "test"]) {
      process.env.NODE_ENV = env;
      delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
      expect(scrapingLockReason()).toBeNull();
      expect(() => assertScrapingAvailable()).not.toThrow();
    }
  });

  it("the whole scraping engine is locked in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(scrapingLockReason()).toMatch(/only in local development/);
    expect(() => assertScrapingAvailable()).toThrow(/only in local development/);
  });

  it("fails closed when NODE_ENV isn't set (a deployed Worker may not have it)", () => {
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(scrapingLockReason()).toMatch(/only in local development/);
  });

  it("the lock can be lifted explicitly for a build with a scraper running next to it", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_LOCAL_ONLY_SCRAPERS = "true";
    expect(scrapingLockReason()).toBeNull();
  });
});
