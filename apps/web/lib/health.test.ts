import { describe, expect, it } from "vitest";
import { healthBody } from "./health";

describe("healthBody", () => {
  it("reports the database and the deployed commit", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    expect(healthBody("connected", "abc123", now, 20)).toEqual({
      status: "ok",
      timestamp: "2026-10-13T00:00:00.000Z",
      database: "connected",
      commit: "abc123",
      migrations: 20,
    });
    expect(healthBody("unreachable", null, now)).toMatchObject({
      status: "degraded",
      commit: null,
      migrations: null,
    });
  });
});
