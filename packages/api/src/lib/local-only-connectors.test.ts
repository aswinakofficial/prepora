import { afterEach, describe, expect, it } from "vitest";
import {
  assertConnectorAvailable,
  connectorForUrl,
  localOnlyLockReason,
} from "./local-only-connectors.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("local-only connectors", () => {
  it("MS Learn is available outside production", () => {
    process.env.NODE_ENV = "development";
    expect(localOnlyLockReason("mslearn")).toBeNull();
    expect(() => assertConnectorAvailable("mslearn")).not.toThrow();
  });

  it("MS Learn is locked in production, and only MS Learn", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(localOnlyLockReason("mslearn")).toMatch(/runs only locally/);
    expect(() => assertConnectorAvailable("mslearn")).toThrow(/runs only locally/);
    expect(localOnlyLockReason("indiabix")).toBeNull();
  });

  it("fails closed when NODE_ENV isn't set (a deployed Worker may not have it)", () => {
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_LOCAL_ONLY_SCRAPERS;
    expect(localOnlyLockReason("mslearn")).toMatch(/runs only locally/);
  });

  it("the lock can be lifted explicitly for a production build with a local scraper", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_LOCAL_ONLY_SCRAPERS = "true";
    expect(localOnlyLockReason("mslearn")).toBeNull();
  });

  it("recognises MS Learn URLs", () => {
    expect(connectorForUrl("https://learn.microsoft.com/en-us/credentials/x")).toBe("mslearn");
    expect(connectorForUrl("https://www.indiabix.com/x")).toBeNull();
    expect(connectorForUrl(undefined)).toBeNull();
  });
});
