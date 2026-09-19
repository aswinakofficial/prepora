import { os, ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../context.js";
import { getDb } from "@prepora/db";
import { questions, scrapedQuestions, questionSets, users, questionOptions, questionAnswers, questionOccurrences, questionTags, media } from "@prepora/db/schema";
import { count, eq, desc, ilike, sql } from "drizzle-orm";
import { isAdminUser } from "@prepora/auth";

// 1. Create an admin procedure
export const adminProcedure = protectedProcedure.use(async ({ context, next }) => {
  const user = context.user;
  const isAuthorized = isAdminUser(user);

  console.log(`[ADMIN PROCEDURE CHECK] User email: ${user?.email}, isAuthorized: ${isAuthorized}`);

  if (!isAuthorized) {
    console.error(`[ADMIN PROCEDURE DENIED] User '${user?.email}' is not authorized as an admin.`);
    throw new ORPCError("UNAUTHORIZED", { message: "Admin access required" });
  }

  return next({ context });
});

export const adminRouter = {
  getDashboardStats: adminProcedure
    .route({
      method: "GET",
      path: "/admin/stats/dashboard",
      summary: "Get dashboard statistics",
    })
    .handler(async () => {
      const db = getDb();
      const [publishedQs] = await db.select({ val: count(questions.id) }).from(questions);
      const [sets] = await db.select({ val: count(questionSets.id) }).from(questionSets).catch(() => [{ val: 0 }]);
      const [pending] = await db.select({ val: count(scrapedQuestions.id) }).from(scrapedQuestions).where(eq(scrapedQuestions.status, "pending"));
      const [userCount] = await db.select({ val: count(users.id) }).from(users);

      return {
        publishedQs: publishedQs?.val || 0,
        sets: sets?.val || 0,
        pending: pending?.val || 0,
        users: userCount?.val || 0,
      };
    }),

  getDatabaseStats: adminProcedure
    .route({
      method: "GET",
      path: "/admin/stats/database",
      summary: "Get database statistics",
    })
    .handler(async () => {
      const db = getDb();
      // Using distinct approach for cross-DB compatibility since $count isn't available everywhere
      const [scrapedCounts] = await db.select({ count: count(scrapedQuestions.id) }).from(scrapedQuestions);
      const [questionCounts] = await db.select({ count: count(questions.id) }).from(questions);
      const [optionCounts] = await db.select({ count: count(questionOptions.id) }).from(questionOptions);

      return {
        scrapedBatches: scrapedCounts?.count || 0,
        liveQuestions: questionCounts?.count || 0,
        options: optionCounts?.count || 0,
      };
    }),

  wipeDatabase: adminProcedure
    .route({
      method: "POST",
      path: "/admin/database/wipe",
      summary: "Wipe all database content",
    })
    .handler(async () => {
      const db = getDb();
      try {
        // Try Postgres TRUNCATE CASCADE first for instant atomic wipe
        await db.execute(
          sql`TRUNCATE TABLE question_answers, question_occurrences, question_options, question_tags, media, questions, scraped_questions, question_sets CASCADE;`
        ).catch(async () => {
          // Fallback to sequential deletion in correct dependency order
          await db.delete(questionAnswers).catch(() => {});
          await db.delete(questionOccurrences).catch(() => {});
          await db.delete(questionTags).catch(() => {});
          await db.delete(media).catch(() => {});
          await db.delete(questionOptions).catch(() => {});
          await db.delete(questions).catch(() => {});
          await db.delete(scrapedQuestions).catch(() => {});
          await db.delete(questionSets).catch(() => {});
        });

        console.log("[WIPE DATABASE] Database successfully wiped.");
        return { success: true };
      } catch (err: any) {
        console.error("[WIPE DATABASE ERROR]", err);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err?.message || "Failed to wipe database",
        });
      }
    }),

  getScrapedQuestions: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scraped",
      summary: "Get latest scraped questions",
    })
    .handler(async () => {
      const db = getDb();
      const results = await db.select().from(scrapedQuestions).limit(50);
      return results.reverse();
    }),

  getReviewQueue: adminProcedure
    .route({
      method: "GET",
      path: "/admin/review",
      summary: "Get pending review items",
    })
    .handler(async () => {
      const db = getDb();
      const pending = await db
        .select()
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.status, "pending"))
        .orderBy(desc(scrapedQuestions.createdAt))
        .limit(30);

      const items = await Promise.all(
        pending.map(async (row) => {
          let duplicates = 0;
          let parsedData: any = row.parsedData;
          if (typeof parsedData === "string") {
            try {
              parsedData = JSON.parse(parsedData);
            } catch (e) {}
          }
          const elements = parsedData?.extractedElements || [];
          if (elements.length > 0) {
            const first = elements[0];
            if (first?.questionText) {
              const similar = await db
                .select({ id: questions.id })
                .from(questions)
                .where(ilike(questions.questionText, `%${first.questionText.substring(0, 30)}%`))
                .limit(1);
              if (similar.length > 0) duplicates++;
            }
          }
          return {
            ...row,
            hasCollision: duplicates > 0
          };
        })
      );
      return items;
    }),

  processReviewItem: adminProcedure
    .route({
      method: "POST",
      path: "/admin/review/process",
      summary: "Process a review item",
    })
    .input(z.object({
      id: z.string(),
      action: z.enum(["approve", "reject"]),
    }))
    .handler(async ({ input }) => {
      const db = getDb();
      
      if (input.action === "reject") {
        await db.update(scrapedQuestions).set({ status: "rejected" }).where(eq(scrapedQuestions.id, input.id));
        return { success: true, message: `Rejected batch ${input.id.substring(0, 8)}...` };
      }

      // Approve logic
      const item = await db.select().from(scrapedQuestions).where(eq(scrapedQuestions.id, input.id)).limit(1);
      if (!item.length) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      let parsedData: any = item[0].parsedData;
      if (typeof parsedData === "string") {
        try { parsedData = JSON.parse(parsedData); } catch (e) {}
      }

      const elements = parsedData?.extractedElements || [];
      const meta = parsedData?.metadata || {};

      let publishCount = 0;
      for (const el of elements) {
        if (!el.questionText || !el.options || !el.answer) continue;

        const insertedQ = await db.insert(questions).values({
          slug: el.questionText.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-') + "-" + Math.random().toString(36).substring(2, 6),
          questionText: el.questionText,
          explanation: el.explanation || null,
          questionType: "mcq",
          status: "published",
        }).returning({ id: questions.id });

        const qId = insertedQ[0].id;
        let seq = 1;
        for (const opt of el.options) {
          const insertedOpt = await db.insert(questionOptions).values({
            questionId: qId,
            optionKey: String.fromCharCode(64 + seq),
            optionText: opt,
            sequence: seq++,
          }).returning({ id: questionOptions.id });

          if (opt === el.answer) {
            await db.insert(questionAnswers).values({
              questionId: qId,
              correctOptionId: insertedOpt[0].id,
            });
          }
        }
        publishCount++;
      }

      await db.update(scrapedQuestions).set({ status: "approved" }).where(eq(scrapedQuestions.id, input.id));

      return { success: true, message: `Approved and published ${publishCount} questions.` };
    }),

  getScraperLogs: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/logs",
      summary: "Get live scraper logs and execution status",
    })
    .handler(async () => {
      try {
        const res = await fetch("http://localhost:8000/scrape/logs");
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {}
      return { status: "offline", logs: ["[SYSTEM]: Scraper Python service on http://localhost:8000 is currently offline."] };
    }),

  triggerScrapeJob: adminProcedure
    .route({
      method: "POST",
      path: "/admin/scrape/trigger",
      summary: "Trigger a scraping job",
    })
    .input(z.object({
      url: z.string(),
      backendUrl: z.string().optional(),
      parserMode: z.string().optional(),
      targetExam: z.string().optional(),
      targetSubject: z.string().optional(),
      jobId: z.string().optional(),
      maxQuestions: z.number().optional(),
      headless: z.boolean().optional(),
    }))
    .handler(async ({ input }) => {
      const { 
        url, 
        backendUrl = "http://localhost:8000/scrape", 
        parserMode = "mcq", 
        targetExam = "Kerala PSC AE Civil", 
        targetSubject = "Strength of Materials",
        maxQuestions = 50,
        headless = true
      } = input;

      // Proxy to the Python scraper service. There is no fallback: a scrape
      // that cannot reach the extraction engine is a failure, not an
      // opportunity to invent content. See docs/architecture/prepora-next-level-plan.md
      // finding #1/#2 for why a prior version of this handler fabricated
      // question content when the backend was unreachable.
      let responseData: any;
      try {
        const pyRes = await fetch(backendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            parser_mode: parserMode,
            target_exam: targetExam,
            target_subject: targetSubject,
            max_questions: maxQuestions,
            headless: headless,
          }),
        });

        if (!pyRes.ok) {
          const errText = await pyRes.text().catch(() => "");
          throw new ORPCError("BAD_GATEWAY", {
            message: `Scraper service returned ${pyRes.status}${errText ? `: ${errText.slice(0, 500)}` : ""}. No content was extracted or saved.`,
          });
        }

        responseData = await pyRes.json();
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        console.error("[SCRAPE PROXY ERROR]: Python scraper backend unreachable:", err);
        throw new ORPCError("BAD_GATEWAY", {
          message: `Scraper service is unreachable at ${backendUrl}. No content was extracted or saved.`,
        });
      }

      let insertedDbRecordId = null;
      if (!responseData.db_saved) {
        const db = getDb();
        const inserted = await db.insert(scrapedQuestions).values({
          sourceUrl: url,
          rawData: responseData.rawHtml ? responseData.rawHtml.slice(0, 2000) : "Scraped via Python Engine",
          parsedData: {
            extractedElements: responseData.extractedElements || [],
            metadata: {
              exam: targetExam,
              subject: targetSubject,
              parserMode,
              engine: responseData.mode || "Python FastAPI",
              extractedCount: responseData.extracted_count || (responseData.extractedElements?.length || 0)
            }
          },
          status: "pending",
        }).returning();
        insertedDbRecordId = inserted[0]?.id || null;
      }

      return {
        ...responseData,
        dbRecordId: insertedDbRecordId,
        message: `Successfully scraped ${responseData.extracted_count || responseData.extractedElements?.length || 0} questions into pending review queue.`,
      };
    }),
};
