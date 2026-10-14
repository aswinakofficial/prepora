import { randomUUID } from "node:crypto";
import { getDb } from "@prepora/db";
import { attempts, questionAnswers, questionOptions, questions } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { recordAttempt } from "./attempts.ts";
import { loadQuestionsWithAnswers } from "./catalog-questions.ts";

// Spec 12: the payloads carry server-rendered HTML next to the raw text. Requires DATABASE_URL.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("rich text in question payloads", () => {
  const seeded: string[] = [];
  afterEach(async () => {
    const db = getDb();
    for (const id of seeded.splice(0)) {
      await db.delete(attempts).where(eq(attempts.questionId, id));
      await db.delete(questionAnswers).where(eq(questionAnswers.questionId, id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
      await db.delete(questions).where(eq(questions.id, id));
    }
  });

  async function seed(textFormat: "plain" | "markdown") {
    const db = getDb();
    const [q] = await db
      .insert(questions)
      .values({
        slug: `rt-${randomUUID().slice(0, 8)}`,
        questionText: "Let $L_1 \\cup L_2$ be *regular*.",
        explanation: "Because $\\Theta(n^2)$.",
        textFormat,
        status: "published",
      })
      .returning({ id: questions.id });
    seeded.push(q.id);
    const [a] = await db
      .insert(questionOptions)
      .values({ questionId: q.id, optionKey: "A", optionText: "$\\Theta(n^2)$", sequence: 1 })
      .returning({ id: questionOptions.id });
    await db
      .insert(questionAnswers)
      .values({ questionId: q.id, correctOptionId: a.id, provenance: "official_sample_key" });
    return { id: q.id, optionId: a.id };
  }

  it("a markdown question gets textHtml, option html and explanationHtml", async () => {
    const { id, optionId } = await seed("markdown");
    const q = (await loadQuestionsWithAnswers(getDb(), [id])).get(id);
    expect(q?.textFormat).toBe("markdown");
    expect(q?.textHtml).toContain("katex");
    expect(q?.textHtml).toContain("<em>regular</em>");
    expect(q?.options[0].html).toContain("katex");
    expect(q?.explanationHtml).toContain("katex");
    expect(q?.questionText).toContain("$L_1"); // the raw text stays for search and JSON-LD

    const result = await recordAttempt(getDb(), { questionId: id, selectedOptionId: optionId });
    expect(result?.explanationHtml).toContain("katex");
  });

  it("a plain question's html is the escaped text, nothing formatted", async () => {
    const { id } = await seed("plain");
    const q = (await loadQuestionsWithAnswers(getDb(), [id])).get(id);
    expect(q?.textHtml).toBe("Let $L_1 \\cup L_2$ be *regular*.");
    expect(q?.options[0].html).toBe("$\\Theta(n^2)$");
  });
});
