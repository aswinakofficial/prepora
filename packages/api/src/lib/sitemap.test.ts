import { randomUUID } from "node:crypto";
import { getDb } from "@prepora/db";
import {
  examSessions,
  exams,
  examTypes,
  examVariants,
  organizations,
  questionOccurrences,
  questionSets,
  questions,
  subjects,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSitemapIndexXml,
  buildSitemapXml,
  getExamSitemapUrls,
  getQuestionSetSitemapUrls,
  getQuestionSitemapUrls,
} from "./sitemap.ts";

// docs/roadmap/engineering-roadmap.md item 26. Requires DATABASE_URL — matches the live-database
// testing convention already established across this repo's own test suites (see
// search/postgres-provider.test.ts). Every test builds its own minimal catalog chain and tears it
// down afterward.
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = "https://prepora.xpar.in";

describe.skipIf(!DATABASE_URL)("sitemap", () => {
  const seeded: {
    organizationId: string;
    examTypeId: string;
    examId: string;
    subjectId: string;
    variantId: string;
    questionSetIds: string[];
    questionIds: string[];
  }[] = [];

  afterEach(async () => {
    if (seeded.length === 0) return;
    const db = getDb();
    for (const chain of seeded.splice(0)) {
      for (const questionId of chain.questionIds) {
        await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, questionId));
        await db.delete(questions).where(eq(questions.id, questionId));
      }
      for (const setId of chain.questionSetIds) {
        await db.delete(questionSets).where(eq(questionSets.id, setId));
      }
      await db.delete(subjects).where(eq(subjects.id, chain.subjectId));
      await db.delete(examVariants).where(eq(examVariants.id, chain.variantId));
      await db.delete(exams).where(eq(exams.id, chain.examId));
      await db.delete(examTypes).where(eq(examTypes.id, chain.examTypeId));
      await db.delete(organizations).where(eq(organizations.id, chain.organizationId));
    }
  });

  async function seedChain() {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);

    const [org] = await db
      .insert(organizations)
      .values({ name: `Test Org ${unique}`, slug: `test-org-${unique}` })
      .returning({ id: organizations.id });
    const [examType] = await db
      .insert(examTypes)
      .values({ slug: `test-type-${unique}`, label: `Test Type ${unique}` })
      .returning({ id: examTypes.id });
    const [exam] = await db
      .insert(exams)
      .values({
        name: `Test Exam ${unique}`,
        slug: `test-exam-${unique}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning({ id: exams.id, slug: exams.slug });
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning({ id: examVariants.id, slug: examVariants.slug });
    const [session2024] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2024", year: 2024 })
      .returning({ id: examSessions.id });
    const [session2025] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2025", year: 2025 })
      .returning({ id: examSessions.id });
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Subject ${unique}`, slug: `test-subject-${unique}` })
      .returning({ id: subjects.id, slug: subjects.slug });

    const chain = {
      organizationId: org.id,
      examTypeId: examType.id,
      examId: exam.id,
      examSlug: exam.slug,
      variantId: variant.id,
      variantSlug: variant.slug,
      subjectId: subject.id,
      subjectSlug: subject.slug,
      session2024Id: session2024.id,
      session2025Id: session2025.id,
      questionSetIds: [] as string[],
      questionIds: [] as string[],
    };
    seeded.push(chain);
    return chain;
  }

  it("includes every published question exactly once", async () => {
    const db = getDb();
    const chain = await seedChain();
    const unique = randomUUID().slice(0, 8);

    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2025Id,
        subjectId: chain.subjectId,
        title: `Set ${unique}`,
        slug: `set-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(set.id);

    const [q1] = await db
      .insert(questions)
      .values({ slug: `q1-${unique}`, questionText: "Q1", status: "published" })
      .returning({ id: questions.id });
    const [q2] = await db
      .insert(questions)
      .values({ slug: `q2-${unique}`, questionText: "Q2", status: "published" })
      .returning({ id: questions.id });
    chain.questionIds.push(q1.id, q2.id);
    await db.insert(questionOccurrences).values({ questionId: q1.id, questionSetId: set.id });
    await db.insert(questionOccurrences).values({ questionId: q2.id, questionSetId: set.id });

    const urls = await getQuestionSitemapUrls(db, BASE_URL);
    const locs = urls.map((u) => u.loc);
    expect(locs).toContain(`${BASE_URL}/questions/q1-${unique}`);
    expect(locs).toContain(`${BASE_URL}/questions/q2-${unique}`);
  });

  it("excludes draft questions", async () => {
    const db = getDb();
    const chain = await seedChain();
    const unique = randomUUID().slice(0, 8);

    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2025Id,
        subjectId: chain.subjectId,
        title: `Set ${unique}`,
        slug: `set-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(set.id);

    const [draftQ] = await db
      .insert(questions)
      .values({ slug: `draft-q-${unique}`, questionText: "Draft", status: "draft" })
      .returning({ id: questions.id });
    chain.questionIds.push(draftQ.id);
    await db.insert(questionOccurrences).values({ questionId: draftQ.id, questionSetId: set.id });

    const urls = await getQuestionSitemapUrls(db, BASE_URL);
    expect(urls.some((u) => u.loc.includes(`draft-q-${unique}`))).toBe(false);
  });

  it("lists a question appearing in several papers once, at /questions/{slug}", async () => {
    const db = getDb();
    const chain = await seedChain();
    const unique = randomUUID().slice(0, 8);

    const [set2024] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2024Id,
        subjectId: chain.subjectId,
        title: `Set 2024 ${unique}`,
        slug: `set-2024-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    const [set2025] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2025Id,
        subjectId: chain.subjectId,
        title: `Set 2025 ${unique}`,
        slug: `set-2025-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(set2024.id, set2025.id);

    const [dupQuestion] = await db
      .insert(questions)
      .values({ slug: `dup-q-${unique}`, questionText: "Dup", status: "published" })
      .returning({ id: questions.id });
    chain.questionIds.push(dupQuestion.id);
    await db
      .insert(questionOccurrences)
      .values({ questionId: dupQuestion.id, questionSetId: set2025.id });
    await db
      .insert(questionOccurrences)
      .values({ questionId: dupQuestion.id, questionSetId: set2024.id });

    const urls = await getQuestionSitemapUrls(db, BASE_URL);
    const matches = urls.filter((u) => u.loc.includes(`dup-q-${unique}`));
    expect(matches).toHaveLength(1);
    expect(matches[0].loc).toBe(`${BASE_URL}/questions/dup-q-${unique}`);
  });

  it("includes a question whose session has no year and whose set has no subject", async () => {
    // Every MS Learn question is like this ("Version 1", no year) — the old year-based URL left
    // all of them out of the sitemap.
    const db = getDb();
    const chain = await seedChain();
    const unique = randomUUID().slice(0, 8);
    const [noYear] = await db
      .insert(examSessions)
      .values({ examVariantId: chain.variantId, label: "Version 1" })
      .returning({ id: examSessions.id });
    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: noYear.id,
        title: `Set ${unique}`,
        slug: `set-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(set.id);
    const [q] = await db
      .insert(questions)
      .values({ slug: `noyear-q-${unique}`, questionText: "No year", status: "published" })
      .returning({ id: questions.id });
    chain.questionIds.push(q.id);
    await db.insert(questionOccurrences).values({ questionId: q.id, questionSetId: set.id });

    const urls = await getQuestionSitemapUrls(db, BASE_URL);
    expect(urls.map((u) => u.loc)).toContain(`${BASE_URL}/questions/noyear-q-${unique}`);
  });

  async function publishOneQuestion(chain: Awaited<ReturnType<typeof seedChain>>) {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);
    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2025Id,
        subjectId: chain.subjectId,
        title: `Set ${unique}`,
        slug: `set-${unique}`,
        publicationStatus: "published",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(set.id);
    const [question] = await db
      .insert(questions)
      .values({ slug: `q-${unique}`, questionText: `Q ${unique}`, status: "published" })
      .returning({ id: questions.id });
    chain.questionIds.push(question.id);
    await db.insert(questionOccurrences).values({ questionId: question.id, questionSetId: set.id });
  }

  it("getExamSitemapUrls includes published exams that have published questions", async () => {
    const db = getDb();
    const chain = await seedChain();
    await publishOneQuestion(chain);
    const urls = await getExamSitemapUrls(db, BASE_URL);
    expect(urls.some((u) => u.loc === `${BASE_URL}/exams/${chain.examSlug}`)).toBe(true);
  });

  it("getExamSitemapUrls leaves out a published exam with no published questions yet", async () => {
    const db = getDb();
    const chain = await seedChain();
    const urls = await getExamSitemapUrls(db, BASE_URL);
    expect(urls.some((u) => u.loc === `${BASE_URL}/exams/${chain.examSlug}`)).toBe(false);
  });

  it("getQuestionSetSitemapUrls excludes draft question sets", async () => {
    const db = getDb();
    const chain = await seedChain();
    const unique = randomUUID().slice(0, 8);

    const [draftSet] = await db
      .insert(questionSets)
      .values({
        examVariantId: chain.variantId,
        examSessionId: chain.session2025Id,
        subjectId: chain.subjectId,
        title: `Draft Set ${unique}`,
        slug: `draft-set-${unique}`,
        publicationStatus: "draft",
      })
      .returning({ id: questionSets.id });
    chain.questionSetIds.push(draftSet.id);

    const urls = await getQuestionSetSitemapUrls(db, BASE_URL);
    expect(urls.some((u) => u.loc.includes(`draft-set-${unique}`))).toBe(false);
  });
});

describe("buildSitemapXml / buildSitemapIndexXml", () => {
  it("builds a valid urlset with the given entries", () => {
    const xml = buildSitemapXml([{ loc: `${BASE_URL}/exams/foo`, priority: "0.9" }]);
    expect(xml).toContain("<urlset");
    expect(xml).toContain(`<loc>${BASE_URL}/exams/foo</loc>`);
  });

  it("references only the filenames it was given, one sitemap tag each", () => {
    const filenames = ["sitemap-pages.xml", "sitemap-exams.xml"];
    const xml = buildSitemapIndexXml(BASE_URL, filenames);
    for (const f of filenames) {
      expect(xml).toContain(`${BASE_URL}/${f}`);
    }
    expect(xml.match(/<sitemap>/g)).toHaveLength(filenames.length);
  });
});
