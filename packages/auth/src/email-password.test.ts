import { afterEach, describe, expect, it } from "vitest";
import { isEmailPasswordEnabled } from "./index.ts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("email/password sign-in", () => {
  it("is available in local development and tests", () => {
    for (const env of ["development", "test"]) {
      process.env.NODE_ENV = env;
      expect(isEmailPasswordEnabled()).toBe(true);
    }
  });

  it("is off in production, where it would let anyone claim an unregistered (admin) email", () => {
    process.env.NODE_ENV = "production";
    expect(isEmailPasswordEnabled()).toBe(false);
  });

  it("fails closed when NODE_ENV isn't set (a deployed Worker may not have it)", () => {
    delete process.env.NODE_ENV;
    expect(isEmailPasswordEnabled()).toBe(false);
  });
});
