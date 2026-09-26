import { describe, expect, it } from "vitest";
import { isNeonUrl } from "./client.ts";

describe("isNeonUrl", () => {
  it("routes Neon connection strings to Neon's serverless driver", () => {
    expect(
      isNeonUrl("postgresql://u:p@ep-cool-name-123-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb"),
    ).toBe(true);
    expect(isNeonUrl("postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=require")).toBe(true);
  });

  it("routes every other Postgres to node-postgres", () => {
    expect(isNeonUrl("postgresql://prepora:prepora@localhost:5432/prepora_dev")).toBe(false);
    expect(isNeonUrl("postgresql://prepora@127.0.0.1:5544/prepora_dev")).toBe(false);
    expect(isNeonUrl("postgresql://u:p@db.example.com/prepora")).toBe(false);
  });

  it("isn't fooled by neon.tech appearing outside the hostname", () => {
    expect(isNeonUrl("postgresql://u:p@localhost:5432/neon.tech")).toBe(false);
    expect(isNeonUrl("postgresql://neon.tech:p@localhost/db")).toBe(false);
  });

  it("treats an unparseable string as not-Neon", () => {
    expect(isNeonUrl("not a url")).toBe(false);
  });
});
