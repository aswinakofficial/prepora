import { randomUUID } from "node:crypto";
import { getDb } from "@prepora/db";
import { intakeItems, scrapedQuestions, sources } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  intakeSummary,
  listIntakeItems,
  markIntakePublished,
  markIntakeRejected,
} from "./intake.ts";

// docs/specs/07-intake.md. Requires DATABASE_URL (the local database); every test builds its own
// source, batch and items, and removes them afterwards.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("intake", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const undo of cleanup.splice(0).reverse()) await undo();
  });

  async function seed() {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);
    const [source] = await db
      .insert(sources)
      .values({ name: `test-${unique}`, baseUrl: "https://invented.test", connectorName: "test" })
      .returning({ id: sources.id });
    const [batch] = await db
      .insert(scrapedQuestions)
      .values({ sourceUrl: "https://invented.test/qp.pdf", parsedData: {} })
      .returning({ id: scrapedQuestions.id });
    const paperKey = `test/${unique}/x/X-1`;
    const item = (number: number, status: "in_review" | "held", issues: unknown[] = []) => ({
      sourceId: source.id,
      paperKey,
      edition: "test",
      number,
      candidate: { number, question_text: `Invented question ${number}?` },
      contentHash: `h${number}`,
      issues,
      parserVersion: "test-1",
      status,
      reviewBatchId: status === "in_review" ? batch.id : null,
    });
    await db.insert(intakeItems).values([
      item(1, "in_review"),
      item(2, "in_review"),
      item(3, "held", [{ code: "math", detail: "a row of sub- or superscripts" }]),
      item(4, "held", [
        { code: "figure", detail: "something is drawn in the question" },
        { code: "image_option", detail: "an option has no text" },
      ]),
    ]);
    cleanup.push(async () => {
      await db.delete(intakeItems).where(eq(intakeItems.paperKey, paperKey));
      await db.delete(scrapedQuestions).where(eq(scrapedQuestions.id, batch.id));
      await db.delete(sources).where(eq(sources.id, source.id));
    });
    return { db, paperKey, batchId: batch.id };
  }

  const statusOf = async (db: ReturnType<typeof getDb>, paperKey: string) =>
    Object.fromEntries(
      (await db.select().from(intakeItems).where(eq(intakeItems.paperKey, paperKey))).map((i) => [
        i.number,
        i.status,
      ]),
    );

  it("summarises a paper by status and by why its held items are held", async () => {
    const { db, paperKey } = await seed();
    const paper = (await intakeSummary(db)).find((p) => p.paperKey === paperKey);
    expect(paper).toMatchObject({
      edition: "test",
      total: 4,
      byStatus: { in_review: 2, held: 2 },
      heldByIssue: { math: 1, figure: 1, image_option: 1 },
    });
  });

  it("lists a paper's held items with their issues", async () => {
    const { db, paperKey } = await seed();
    const held = await listIntakeItems(db, { paperKey });
    expect(held.map((i) => [i.number, i.issues.map((x) => x.code)])).toEqual([
      [3, ["math"]],
      [4, ["figure", "image_option"]],
    ]);
    expect(held[0].preview).toBe("Invented question 3?");
  });

  it("publishing marks one question; a skip or a rejected batch marks the rest", async () => {
    const { db, paperKey, batchId } = await seed();
    await markIntakePublished(db, batchId, 1, undefined);
    await markIntakeRejected(db, batchId, 2);
    expect(await statusOf(db, paperKey)).toEqual({
      1: "published",
      2: "rejected",
      3: "held",
      4: "held",
    });
  });

  it("rejecting a batch leaves held items that were never in it alone", async () => {
    const { db, paperKey, batchId } = await seed();
    await markIntakeRejected(db, batchId);
    expect(await statusOf(db, paperKey)).toEqual({
      1: "rejected",
      2: "rejected",
      3: "held",
      4: "held",
    });
  });
});
