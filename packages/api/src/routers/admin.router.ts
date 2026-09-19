import { ORPCError } from "@orpc/server";
import { isAdminUser } from "@prepora/auth";
import { getDb } from "@prepora/db";
import {
  auditLogs,
  media,
  questionAnswers,
  questionOccurrences,
  questionOptions,
  questionSets,
  questions,
  questionTags,
  scrapedQuestions,
  users,
} from "@prepora/db/schema";
import { count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../context.js";

// Typed confirmation required before wipeDatabase executes — see docs/roadmap/engineering-roadmap.md
// item 6. Exported so the frontend prompts for exactly this string rather than hardcoding a second
// copy that could drift from what the server actually checks.
export const WIPE_DATABASE_CONFIRMATION_PHRASE = "WIPE DATABASE";

// The one write path into auditLogs — see docs/architecture/prepora-next-level-plan.md finding #17.
// Every privileged, content-affecting or destructive admin action should go through this rather than
// executing silently.
async function writeAuditLog(
  db: ReturnType<typeof getDb>,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValue: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
    newValue: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
  });
}

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

// ─── Scraper service connectivity ──────────────────────────────────────────────
// The scraper's address and credential are server configuration, never
// caller input — a prior version accepted a `backendUrl` from the request
// body, which let a caller point this server's outbound fetch at an
// arbitrary host (see docs/architecture/prepora-next-level-plan.md
// finding #4 and roadmap item 3). The admin UI never talks to apps/scraper
// directly either; every call is proxied through fetchScraper() so the
// service token never reaches the browser.

function getScraperBaseUrl(): string {
  return (process.env.SCRAPER_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
}

function getScraperAuthHeaders(): Record<string, string> {
  const token = process.env.PIPELINE_SERVICE_TOKEN;
  if (!token) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message:
        "PIPELINE_SERVICE_TOKEN is not configured. Set it in the environment (see .env.example) to enable scraping.",
    });
  }
  return { Authorization: `Bearer ${token}` };
}

async function fetchScraper(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getScraperAuthHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${getScraperBaseUrl()}${path}`, { ...init, headers });
}

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
      const [sets] = await db
        .select({ val: count(questionSets.id) })
        .from(questionSets)
        .catch(() => [{ val: 0 }]);
      const [pending] = await db
        .select({ val: count(scrapedQuestions.id) })
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.status, "pending"));
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
      const [scrapedCounts] = await db
        .select({ count: count(scrapedQuestions.id) })
        .from(scrapedQuestions);
      const [questionCounts] = await db.select({ count: count(questions.id) }).from(questions);
      const [optionCounts] = await db
        .select({ count: count(questionOptions.id) })
        .from(questionOptions);

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
    .input(z.object({ confirmation: z.string() }))
    .handler(async ({ input, context }) => {
      if (input.confirmation !== WIPE_DATABASE_CONFIRMATION_PHRASE) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Confirmation did not match. Type "${WIPE_DATABASE_CONFIRMATION_PHRASE}" exactly to proceed.`,
        });
      }

      // Refuse in production unless someone has deliberately opted in — a wipe should never be one
      // accidental click away from destroying real user data.
      const allowInProduction = process.env.ALLOW_DESTRUCTIVE_ADMIN_OPS === "true";
      if (process.env.NODE_ENV === "production" && !allowInProduction) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Wiping the database is disabled in production. Set ALLOW_DESTRUCTIVE_ADMIN_OPS=true to override.",
        });
      }

      const db = getDb();

      // Count what's about to be destroyed *before* destroying it — after a TRUNCATE every one of
      // these reads back as zero, so this is the only chance to record what was actually wiped.
      const [
        [qCount],
        [qsCount],
        [scrapedCount],
        [optCount],
        [ansCount],
        [occCount],
        [tagCount],
        [mediaCount],
      ] = await Promise.all([
        db.select({ val: count(questions.id) }).from(questions),
        db.select({ val: count(questionSets.id) }).from(questionSets),
        db.select({ val: count(scrapedQuestions.id) }).from(scrapedQuestions),
        db.select({ val: count(questionOptions.id) }).from(questionOptions),
        db.select({ val: count(questionAnswers.id) }).from(questionAnswers),
        db.select({ val: count(questionOccurrences.id) }).from(questionOccurrences),
        db.select({ val: count(questionTags.questionId) }).from(questionTags),
        db.select({ val: count(media.id) }).from(media),
      ]);

      const affectedCounts = {
        questions: qCount?.val ?? 0,
        questionSets: qsCount?.val ?? 0,
        scrapedQuestions: scrapedCount?.val ?? 0,
        questionOptions: optCount?.val ?? 0,
        questionAnswers: ansCount?.val ?? 0,
        questionOccurrences: occCount?.val ?? 0,
        questionTags: tagCount?.val ?? 0,
        media: mediaCount?.val ?? 0,
      };

      // Write the audit row *before* executing, per docs/roadmap/engineering-roadmap.md item 6 —
      // if the wipe itself fails partway, there is still a durable record that it was attempted,
      // by whom, and what it was about to destroy.
      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "wipe_database",
        entityType: "database",
        entityId: "all",
        oldValue: affectedCounts,
      });

      try {
        // Try Postgres TRUNCATE CASCADE first for instant atomic wipe
        await db
          .execute(
            sql`TRUNCATE TABLE question_answers, question_occurrences, question_options, question_tags, media, questions, scraped_questions, question_sets CASCADE;`,
          )
          .catch(async () => {
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

        console.log(`[WIPE DATABASE] Wiped by ${context.user.email}:`, affectedCounts);
        return { success: true, wiped: affectedCounts };
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
            } catch (_e) {}
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
            hasCollision: duplicates > 0,
          };
        }),
      );
      return items;
    }),

  processReviewItem: adminProcedure
    .route({
      method: "POST",
      path: "/admin/review/process",
      summary: "Process a review item",
    })
    .input(
      z.object({
        id: z.string(),
        action: z.enum(["approve", "reject"]),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();

      if (input.action === "reject") {
        await db
          .update(scrapedQuestions)
          .set({ status: "rejected" })
          .where(eq(scrapedQuestions.id, input.id));
        await writeAuditLog(db, {
          actorId: context.user.id,
          action: "reject_scraped_question",
          entityType: "scraped_question",
          entityId: input.id,
          oldValue: { status: "pending" },
          newValue: { status: "rejected" },
        });
        return { success: true, message: `Rejected batch ${input.id.substring(0, 8)}...` };
      }

      // Approve logic
      const item = await db
        .select()
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.id, input.id))
        .limit(1);
      if (!item.length) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      let parsedData: any = item[0].parsedData;
      if (typeof parsedData === "string") {
        try {
          parsedData = JSON.parse(parsedData);
        } catch (_e) {}
      }

      const elements = parsedData?.extractedElements || [];
      const _meta = parsedData?.metadata || {};

      let publishCount = 0;
      for (const el of elements) {
        if (!el.questionText || !el.options || !el.answer) continue;

        const insertedQ = await db
          .insert(questions)
          .values({
            slug:
              el.questionText
                .slice(0, 30)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-") +
              "-" +
              Math.random().toString(36).substring(2, 6),
            questionText: el.questionText,
            explanation: el.explanation || null,
            questionType: "mcq",
            status: "published",
          })
          .returning({ id: questions.id });

        const qId = insertedQ[0].id;
        let seq = 1;
        for (const opt of el.options) {
          const insertedOpt = await db
            .insert(questionOptions)
            .values({
              questionId: qId,
              optionKey: String.fromCharCode(64 + seq),
              optionText: opt,
              sequence: seq++,
            })
            .returning({ id: questionOptions.id });

          if (opt === el.answer) {
            await db.insert(questionAnswers).values({
              questionId: qId,
              correctOptionId: insertedOpt[0].id,
            });
          }
        }
        publishCount++;
      }

      await db
        .update(scrapedQuestions)
        .set({ status: "approved" })
        .where(eq(scrapedQuestions.id, input.id));

      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "approve_scraped_question",
        entityType: "scraped_question",
        entityId: input.id,
        oldValue: { status: "pending" },
        newValue: { status: "approved", publishCount },
      });

      return { success: true, message: `Approved and published ${publishCount} questions.` };
    }),

  getScraperHealth: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/health",
      summary: "Check scraper service health and configuration",
    })
    .handler(async () => {
      try {
        const res = await fetchScraper("/health");
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return { status: "online" as const, ...body };
        }
        return { status: "offline" as const, reason: `Scraper returned HTTP ${res.status}` };
      } catch (err: any) {
        if (err instanceof ORPCError) {
          // PIPELINE_SERVICE_TOKEN isn't configured — that's a
          // configuration problem, not "the service is down".
          return { status: "misconfigured" as const, reason: err.message };
        }
        return {
          status: "offline" as const,
          reason: err?.message || `Scraper is unreachable at ${getScraperBaseUrl()}`,
        };
      }
    }),

  getMsLearnCatalog: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/ms-learn/catalog",
      summary: "Discover available Microsoft Learn practice assessments",
    })
    .handler(async () => {
      const res = await fetchScraper("/scrape/ms-learn/catalog");
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new ORPCError("BAD_GATEWAY", {
          message: `Scraper returned ${res.status} while fetching the MS Learn catalog${errText ? `: ${errText.slice(0, 500)}` : ""}.`,
        });
      }
      return res.json();
    }),

  triggerMsLearnAuth: adminProcedure
    .route({
      method: "POST",
      path: "/admin/scrape/ms-learn/auth",
      summary: "Launch the interactive Microsoft Learn authentication flow",
    })
    .handler(async () => {
      const res = await fetchScraper("/scrape/ms-learn/auth", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ORPCError("BAD_GATEWAY", {
          message:
            body?.detail ||
            `Scraper returned ${res.status} while launching Microsoft authentication.`,
        });
      }
      return body;
    }),

  getScraperLogs: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/logs",
      summary: "Get live scraper logs and execution status",
    })
    .handler(async () => {
      try {
        const res = await fetchScraper("/scrape/logs");
        if (res.ok) {
          return await res.json();
        }
        return { status: "offline", logs: [`[SYSTEM]: Scraper returned HTTP ${res.status}.`] };
      } catch (err: any) {
        if (err instanceof ORPCError) {
          return { status: "misconfigured", logs: [`[SYSTEM]: ${err.message}`] };
        }
        return {
          status: "offline",
          logs: [`[SYSTEM]: Scraper service at ${getScraperBaseUrl()} is currently offline.`],
        };
      }
    }),

  triggerScrapeJob: adminProcedure
    .route({
      method: "POST",
      path: "/admin/scrape/trigger",
      summary: "Trigger a scraping job",
    })
    .input(
      z.object({
        url: z.string(),
        parserMode: z.string().optional(),
        targetExam: z.string().optional(),
        targetSubject: z.string().optional(),
        jobId: z.string().optional(),
        maxQuestions: z.number().optional(),
        headless: z.boolean().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const {
        url,
        parserMode = "mcq",
        targetExam = "Kerala PSC AE Civil",
        targetSubject = "Strength of Materials",
        maxQuestions = 50,
        headless = true,
      } = input;

      // Proxy to the Python scraper service. There is no fallback: a scrape
      // that cannot reach the extraction engine is a failure, not an
      // opportunity to invent content. See docs/architecture/prepora-next-level-plan.md
      // finding #1/#2 for why a prior version of this handler fabricated
      // question content when the backend was unreachable.
      let responseData: any;
      try {
        const pyRes = await fetchScraper("/scrape", {
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
          message: `Scraper service is unreachable at ${getScraperBaseUrl()}. No content was extracted or saved.`,
        });
      }

      let insertedDbRecordId = null;
      if (!responseData.db_saved) {
        const db = getDb();
        const inserted = await db
          .insert(scrapedQuestions)
          .values({
            sourceUrl: url,
            rawData: responseData.rawHtml
              ? responseData.rawHtml.slice(0, 2000)
              : "Scraped via Python Engine",
            parsedData: {
              extractedElements: responseData.extractedElements || [],
              metadata: {
                exam: targetExam,
                subject: targetSubject,
                parserMode,
                engine: responseData.mode || "Python FastAPI",
                extractedCount:
                  responseData.extracted_count || responseData.extractedElements?.length || 0,
              },
            },
            status: "pending",
          })
          .returning();
        insertedDbRecordId = inserted[0]?.id || null;
      }

      return {
        ...responseData,
        dbRecordId: insertedDbRecordId,
        message: `Successfully scraped ${responseData.extracted_count || responseData.extractedElements?.length || 0} questions into pending review queue.`,
      };
    }),
};
