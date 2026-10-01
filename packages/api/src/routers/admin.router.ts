import { ORPCError } from "@orpc/server";
import { isAdminUser } from "@prepora/auth";
import { getDb } from "@prepora/db";
import {
  auditLogs,
  duplicateReviews,
  examSessions,
  exams,
  examTypes,
  examVariants,
  featureFlags,
  organizations,
  questionOptions,
  questionSets,
  questions,
  scrapedQuestions,
  sources,
  users,
} from "@prepora/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../context.js";
import { stripScraperBoilerplate } from "../lib/explanation-cleanup.js";
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  getFeatureFlagStates,
  isFeatureFlagKey,
} from "../lib/feature-flags.js";
import {
  assertPublishingAvailable,
  assertScrapingAvailable,
  publishingLockReason,
  scrapingLockReason,
} from "../lib/local-only-services.js";
import {
  computeSourceHealthStats,
  EMPTY_SOURCE_HEALTH_STATS,
  isSourceDegraded,
} from "../lib/pipeline-health.js";
import { explanationWithReadingLinks } from "../lib/reading-links.js";
import { answerKeysForReviewElement } from "../lib/review-answers.js";
import { countNewQuestions, loadExamQuestionTexts } from "../lib/review-dedupe.js";
import { reviewQualityIssues } from "../lib/review-quality.js";
import { WIPE_DATABASE_CONFIRMATION_PHRASE, WIPE_DATABASE_KEEP_TABLES } from "../shared.js";

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
        "PIPELINE_SERVICE_TOKEN is not configured. Set it in the environment (see .env.example) — the scraper and the publishing pipeline both require it.",
    });
  }
  return { Authorization: `Bearer ${token}` };
}

async function fetchScraper(path: string, init: RequestInit = {}): Promise<Response> {
  // The one gateway to apps/scraper, so the local-only lock lives here: outside local development
  // no request to the scraper ever leaves this server (lib/local-only-services.ts).
  assertScrapingAvailable();
  const headers = {
    ...getScraperAuthHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${getScraperBaseUrl()}${path}`, { ...init, headers });
}

// ─── Pipeline service connectivity ─────────────────────────────────────────────
// apps/pipeline's HTTP wrapper (prepora_pipeline/api.py) — same reasoning and same
// PIPELINE_SERVICE_TOKEN as fetchScraper() above: this Worker cannot spawn subprocesses, so
// idempotent, occurrence-aware publishing (docs/roadmap/engineering-roadmap.md item 18) has to be
// reached over HTTP, never by shelling out to the CLI.

function getPipelineBaseUrl(): string {
  return (process.env.PIPELINE_SERVICE_URL || "http://localhost:8001").replace(/\/+$/, "");
}

async function fetchPipeline(path: string, init: RequestInit = {}): Promise<Response> {
  // The one gateway to apps/pipeline — local-only like the scraper (lib/local-only-services.ts):
  // outside local development no request to it ever leaves this server.
  assertPublishingAvailable();
  const headers = {
    ...getScraperAuthHeaders(),
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${getPipelineBaseUrl()}${path}`, { ...init, headers });
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Maps a legacy scraped review-queue element onto a NormalizedQuestion for apps/pipeline's
// /publish endpoint. The review queue's free-text exam/subject metadata (apps/scraper/main.py's
// target_exam/target_subject) was never designed to carry real catalog slugs
// (docs/roadmap/engineering-roadmap.md item 10) — slugifying it here is a best-effort guess, not a
// guarantee of a match. When it doesn't match a registered exam, publish_question() raises a clear
// PublishError instead of the old code's silent slug collisions and string-equality answer
// mismatches; that is the intended, documented boundary of this delegation, not a bug.
// An image the scraper downloaded and stored (apps/scraper/ms_learn_media.py).
interface ScrapedImage {
  placement: "question" | "option" | "explanation";
  optionIndex?: number | null;
  storageKey: string;
  mimeType: string;
  alt?: string;
  sourceUrl?: string | null;
}

function reviewElementToNormalizedQuestion(
  el: {
    questionText: string;
    options: string[];
    answer: string;
    explanation?: string;
    additionalReadingLinks?: Array<{ text?: string; url?: string }>;
    images?: ScrapedImage[];
  },
  meta: {
    exam?: string;
    subject?: string;
    targetExam?: string;
    targetSubject?: string;
    questionSetTitle?: string;
    questionIdentity?: string;
  },
  number: number,
  examSlug?: string,
) {
  const examName = meta.exam || meta.targetExam || "unknown-exam";
  const subjectName = meta.subject || meta.targetSubject || "unknown-subject";
  const keys = answerKeysForReviewElement(el);

  return {
    exam_slug: examSlug ?? slugify(examName),
    exam_variant_slug: "standard",
    subject_slug: slugify(subjectName),
    question_set_title: meta.questionSetTitle || null,
    // Pool sources (MS Learn) identify questions by content, so approving a re-scrape adds only
    // questions not already published — see the pipeline's stable_id.py.
    identity: meta.questionIdentity === "content" ? ("content" as const) : ("position" as const),
    number,
    question_text: el.questionText,
    options: el.options.map((text, i) => ({ key: String.fromCharCode(65 + i), text })),
    ...(keys.length === 1
      ? {
          question_type: "mcq" as const,
          answer: { type: "mcq" as const, correct_key: keys[0] },
        }
      : {
          question_type: "multiple_correct" as const,
          answer: { type: "multiple_correct" as const, correct_keys: keys },
        }),
    explanation: explanationWithReadingLinks(
      stripScraperBoilerplate(el.explanation),
      el.additionalReadingLinks,
    ),
    media: (el.images ?? []).map((image) => ({
      placement: image.placement,
      option_key:
        image.placement === "option" && image.optionIndex != null
          ? String.fromCharCode(65 + image.optionIndex)
          : null,
      storage_key: image.storageKey,
      mime_type: image.mimeType,
      alt_text: image.alt || null,
      source_url: image.sourceUrl ?? null,
    })),
    parser_version: "legacy-review-queue-v1",
  };
}

// Certification codes such as "AB-100", "AZ-900" or "DP-900" — the one stable identifier in
// scraped MS Learn titles, which otherwise vary freely ("Exam AB-100", "Practice Assessment for
// Exam AB-100: Agentic AI ...").
function extractExamCode(value: string): string | null {
  const match = value.match(/\b([a-z]{2,3}-\d{3})\b/i);
  return match ? match[1].toLowerCase() : null;
}

// Finds the already-registered exam a scraped batch belongs to. Slugifying the free-text exam
// name alone isn't enough: titles vary between crawls ("Exam AB-100" vs "Practice Assessment for
// Exam AB-100: ..."), and an exam slugged differently from the one already registered used to get
// a second, duplicate exam row created on approval. Match
// order, most to least specific: exact slug, exam code listed in an exam's url_match_pattern,
// then any url_match_pattern substring found in the source URL (the column's original purpose —
// see its comment in packages/db/src/schema/catalog.ts).
async function resolveRegisteredExamSlug(
  db: ReturnType<typeof getDb>,
  examName: string,
  sourceUrl: string | null,
  // Callers resolving many batches at once (getReviewQueue) pass the exams in, loaded once.
  preloadedExams?: { slug: string; urlMatchPattern: string | null }[],
): Promise<string | null> {
  const rows =
    preloadedExams ??
    (await db.select({ slug: exams.slug, urlMatchPattern: exams.urlMatchPattern }).from(exams));
  const withPatterns = rows.map((row) => ({
    slug: row.slug,
    patterns: (row.urlMatchPattern ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  }));

  const candidateSlug = slugify(examName);
  const exact = withPatterns.find((row) => row.slug === candidateSlug);
  if (exact) return exact.slug;

  const code = extractExamCode(examName);
  if (code) {
    const byCode = withPatterns.find((row) => row.patterns.includes(code));
    if (byCode) return byCode.slug;
  }

  const url = sourceUrl?.toLowerCase();
  if (url) {
    const byUrl = withPatterns.find((row) => row.patterns.some((p) => url.includes(p)));
    if (byUrl) return byUrl.slug;
  }

  return null;
}

// apps/pipeline's publish stage deliberately refuses to invent an exam/organization from free
// text (see publish.py's _resolve_exam docstring) — which organization or category a brand-new
// exam belongs to is a real decision, and publish() has no way to make it safely on its own. An
// admin clicking "approve" on a reviewed batch IS that decision being made by a human, so this is
// the one place it's safe to auto-register a missing exam — never inside publish() itself, which
// stays strict for every other caller. This is the only place exams are created, building the
// org -> exam type -> exam -> variant -> session chain (onConflictDoNothing + fallback lookup, so
// concurrent approvals racing on the same new exam can't produce a duplicate-row error). Nothing
// is seeded: categories are otherwise managed from the admin UI (listExamTypes and friends), so
// the "certification" category is created here too if an admin hasn't created (or has removed)
// it.
//
// Scoped to Microsoft Learn for now — the only source that discovers exams dynamically; every
// other source's exams are already registered, and inventing an organization for an unfamiliar
// source URL isn't a decision this function should guess at either.
//
// Callers must run resolveRegisteredExamSlug first — this only ever creates, it doesn't look for
// an existing exam under a different slug.
async function ensureExamRegistered(
  db: ReturnType<typeof getDb>,
  params: {
    examSlug: string;
    examName: string;
    sourceUrl: string | null;
    urlMatchPattern: string | null;
    logoUrl?: string | null;
    description?: string | null;
  },
): Promise<void> {
  if (!params.sourceUrl?.includes("microsoft.com")) return;

  const orgSlug = "microsoft";
  const [insertedOrg] = await db
    .insert(organizations)
    .values({
      name: "Microsoft",
      slug: orgSlug,
      jurisdiction: "global",
      officialUrl: "https://learn.microsoft.com",
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();
  const org =
    insertedOrg ??
    (await db.query.organizations.findFirst({ where: (o, { eq: eqOp }) => eqOp(o.slug, orgSlug) }));
  if (!org) return;

  const examTypeSlug = "certification";
  const [insertedExamType] = await db
    .insert(examTypes)
    .values({ slug: examTypeSlug, label: "Certification" })
    .onConflictDoNothing({ target: examTypes.slug })
    .returning();
  const examType =
    insertedExamType ??
    (await db.query.examTypes.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.slug, examTypeSlug),
    }));
  if (!examType) return;

  const [insertedExam] = await db
    .insert(exams)
    .values({
      name: params.examName,
      slug: params.examSlug,
      organizationId: org.id,
      examTypeId: examType.id,
      description: params.description || null,
      logoUrl: params.logoUrl || null,
      officialUrl: "https://learn.microsoft.com",
      urlMatchPattern: params.urlMatchPattern,
      status: "published",
    })
    .onConflictDoNothing({ target: exams.slug })
    .returning();
  const exam =
    insertedExam ??
    (await db.query.exams.findFirst({ where: (e, { eq: eqOp }) => eqOp(e.slug, params.examSlug) }));
  if (!exam) return;

  const [insertedVariant] = await db
    .insert(examVariants)
    .values({ examId: exam.id, name: "Standard", slug: "standard" })
    .onConflictDoNothing({ target: [examVariants.examId, examVariants.slug] })
    .returning();
  const variant =
    insertedVariant ??
    (await db.query.examVariants.findFirst({
      where: (v, { eq: eqOp }) => and(eqOp(v.examId, exam.id), eqOp(v.slug, "standard")),
    }));
  if (!variant) return;

  const existingSession = await db.query.examSessions.findFirst({
    where: (s, { eq: eqOp }) => eqOp(s.examVariantId, variant.id),
  });
  if (!existingSession) {
    await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "Version 1", year: null, status: "published" });
  }
}

// How many questions from one review batch are published to apps/pipeline at once — see
// processOneReviewItem.
const PUBLISH_CONCURRENCY = 12;

// Shared by processReviewItem and processReviewBatch (docs/roadmap/engineering-roadmap.md item
// 21) so there is exactly one place that decides what happens to a review item, whether it's
// processed alone or as part of a batch.
// ─── Review results and possible-duplicate decisions ───────────────────────────
// What approving a batch did, in a shape the review page can present without parsing messages.

export interface ReviewFailure {
  number: number;
  preview: string;
  reason: string;
}

export interface ReviewCounts {
  published: number;
  added: number;
  alreadyInExam: number;
  /** Possible duplicates found on this attempt and held for a decision. */
  held: number;
  /** Decisions still open for this batch, including ones held on earlier attempts. */
  pendingDecisions: number;
  failed: ReviewFailure[];
}

export interface ReviewResult extends ReviewCounts {
  success: boolean;
  status: "approved" | "needs_decisions" | "not_approved" | "rejected";
  message: string;
}

const EMPTY_REVIEW_COUNTS: ReviewCounts = {
  published: 0,
  added: 0,
  alreadyInExam: 0,
  held: 0,
  pendingDecisions: 0,
  failed: [],
};

interface DuplicateDecisionPayload {
  existing_question_id: string;
  similarity_score: number;
  options_match: boolean;
  answer_match: boolean;
  suggestion: "same" | "different";
}

type PipelinePublishResponse =
  | { held: true; decision: DuplicateDecisionPayload }
  | { held: false; occurrence_created?: boolean; question_id?: string };

function questionPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 70 ? `${oneLine.slice(0, 70)}…` : oneLine;
}

/** The pipeline's {"detail": "..."} error, without the JSON wrapper. */
async function pipelineErrorReason(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {}
  return body || `Pipeline service returned ${res.status}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function describeReviewResult(status: ReviewResult["status"], c: ReviewCounts): string {
  const parts = [`${plural(c.added, "new question")} added`];
  if (c.alreadyInExam > 0) parts.push(`${c.alreadyInExam} already in the exam`);
  const summary = parts.join(" · ");
  if (status === "approved") return `Approved: ${summary}.`;
  if (status === "needs_decisions") {
    return `${summary}. ${plural(c.pendingDecisions, "possible duplicate")} need${
      c.pendingDecisions === 1 ? "s" : ""
    } your decision before this batch is complete.`;
  }
  const decisions =
    c.pendingDecisions > 0 ? ` ${plural(c.pendingDecisions, "possible duplicate")} to review.` : "";
  return `${summary}. ${plural(c.failed.length, "question")} couldn't be published — approve again to retry.${decisions}`;
}

async function holdPossibleDuplicate(
  db: ReturnType<typeof getDb>,
  batchId: string,
  questionNumber: number,
  candidate: unknown,
  decision: DuplicateDecisionPayload,
): Promise<void> {
  // Re-approving a batch holds the same question again: refresh an undecided row, but never
  // reopen one a person already decided.
  await db
    .insert(duplicateReviews)
    .values({
      scrapedQuestionId: batchId,
      questionNumber,
      candidate,
      existingQuestionId: decision.existing_question_id,
      similarity: decision.similarity_score,
      optionsMatch: decision.options_match,
      answerMatch: decision.answer_match,
      suggestion: decision.suggestion,
    })
    .onConflictDoUpdate({
      target: [duplicateReviews.scrapedQuestionId, duplicateReviews.questionNumber],
      set: {
        candidate,
        existingQuestionId: decision.existing_question_id,
        similarity: decision.similarity_score,
        optionsMatch: decision.options_match,
        answerMatch: decision.answer_match,
        suggestion: decision.suggestion,
      },
      setWhere: eq(duplicateReviews.status, "pending"),
    });
}

async function countPendingDecisions(db: ReturnType<typeof getDb>, batchId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(duplicateReviews)
    .where(
      and(eq(duplicateReviews.scrapedQuestionId, batchId), eq(duplicateReviews.status, "pending")),
    );
  return Number(row?.n ?? 0);
}

async function resolveDuplicate(
  db: ReturnType<typeof getDb>,
  actorId: string,
  id: string,
  decision: "same" | "different" | "skip",
  // For "same": which version the published question should show — the one already published
  // (default) or the new one from this batch. Either way the other wording is remembered.
  keep: "existing" | "new" = "existing",
): Promise<void> {
  assertPublishingAvailable();
  const [row] = await db.select().from(duplicateReviews).where(eq(duplicateReviews.id, id));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "That decision no longer exists." });
  if (row.status !== "pending") {
    throw new ORPCError("CONFLICT", { message: "This question has already been decided." });
  }

  if (decision !== "skip") {
    const query =
      decision === "same"
        ? `link_to_question_id=${encodeURIComponent(row.existingQuestionId)}${
            keep === "new" ? "&use_new_wording=true" : ""
          }`
        : "publish_as_new=true";
    const res = await fetchPipeline(`/publish?${query}`, {
      method: "POST",
      body: JSON.stringify(row.candidate),
    });
    if (!res.ok) {
      // 422 = the pipeline refused this decision with a reason (e.g. the new version has a
      // different number of options); anything else is the service itself failing.
      throw new ORPCError(res.status === 422 ? "BAD_REQUEST" : "BAD_GATEWAY", {
        message: `Couldn't apply that to question ${row.questionNumber}: ${await pipelineErrorReason(res)}`,
      });
    }
  }

  const status =
    decision === "skip" ? "skipped" : decision === "same" && keep === "new" ? "same_new" : decision;
  await db
    .update(duplicateReviews)
    .set({ status, decidedBy: actorId, decidedAt: new Date() })
    .where(eq(duplicateReviews.id, id));
  await writeAuditLog(db, {
    actorId,
    action: "resolve_possible_duplicate",
    entityType: "duplicate_review",
    entityId: id,
    oldValue: { status: "pending" },
    newValue: {
      status,
      batch: row.scrapedQuestionId,
      questionNumber: row.questionNumber,
      existingQuestionId: row.existingQuestionId,
      suggestion: row.suggestion,
      keep: decision === "same" ? keep : undefined,
    },
  });
}

async function processOneReviewItem(
  db: ReturnType<typeof getDb>,
  actorId: string,
  input: { id: string; action: "approve" | "reject" },
): Promise<ReviewResult> {
  if (input.action === "reject") {
    await db
      .update(scrapedQuestions)
      .set({ status: "rejected" })
      .where(eq(scrapedQuestions.id, input.id));
    await writeAuditLog(db, {
      actorId,
      action: "reject_scraped_question",
      entityType: "scraped_question",
      entityId: input.id,
      oldValue: { status: "pending" },
      newValue: { status: "rejected" },
    });
    return {
      ...EMPTY_REVIEW_COUNTS,
      success: true,
      status: "rejected",
      message: `Rejected batch ${input.id.substring(0, 8)}.`,
    };
  }

  // Approve logic. Approving publishes every question through the pipeline service, which only
  // exists in local development — refuse up front rather than failing each question one by one.
  assertPublishingAvailable();
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
  const meta = { ...(parsedData?.metadata || {}) };
  // MS Learn practice assessments draw questions at random from a pool, so they're always
  // identified by content — including batches scraped before the crawler started tagging them
  // with questionIdentity (which would otherwise publish by position and drop new questions).
  if (item[0].sourceUrl?.includes("learn.microsoft.com")) meta.questionIdentity = "content";
  const examName = meta.exam || meta.targetExam || "unknown-exam";

  // Publish into the exam this batch already belongs to when one is registered; otherwise admin
  // approval is the one point a brand-new exam is safe to auto-register — see
  // ensureExamRegistered's docstring. Must run before the publish loop below, since /publish
  // rejects any exam_slug that doesn't already resolve to a real exams row.
  let examSlug = await resolveRegisteredExamSlug(db, examName, item[0].sourceUrl);
  if (!examSlug) {
    const code = extractExamCode(examName);
    examSlug = code ?? slugify(examName);
    await ensureExamRegistered(db, {
      examSlug,
      // The official name the crawler found ("Microsoft Certified: AI Business Professional");
      // older batches only carry the code-bearing identifier ("Exam AB-730").
      examName: meta.examTitle || examName,
      sourceUrl: item[0].sourceUrl,
      // Recorded so the next batch for this exam resolves here by code rather than registering
      // yet another duplicate.
      urlMatchPattern: code,
      logoUrl: meta.logoUrl,
      description: meta.description,
    });
  }

  // Delegates to apps/pipeline's /publish (docs/roadmap/engineering-roadmap.md item 18) instead
  // of writing questions/options/answers directly — that inline logic used a random slug suffix
  // and matched answers by string equality against option text, so a reworded or retyped option
  // silently published with no correct answer at all. Each element publishes independently so one
  // bad item (most likely: exam/subject metadata that doesn't match a registered catalog slug —
  // see reviewElementToNormalizedQuestion's docstring) doesn't block the rest of the batch.
  const publishable = elements.filter((el: any) => el.questionText && el.options && el.answer) as {
    questionText: string;
    options: string[];
    answer: string;
    explanation?: string;
    additionalReadingLinks?: Array<{ text?: string; url?: string }>;
    images?: ScrapedImage[];
  }[];

  let publishCount = 0;
  // Of those, how many actually joined the exam vs. were already in it (a re-scrape is mostly the
  // latter — publishing them is a deduplicated no-op).
  let addedCount = 0;
  let heldCount = 0;
  const failed: ReviewFailure[] = [];
  const publishOne = async (el: (typeof publishable)[number], number: number) => {
    try {
      const normalized = reviewElementToNormalizedQuestion(el, meta, number, examSlug);
      // A possible duplicate is held for a person to decide (duplicate_reviews), not failed —
      // see apps/pipeline/prepora_pipeline/stages/publish.py's publish_question().
      const res = await fetchPipeline("/publish?on_near_duplicate=hold", {
        method: "POST",
        body: JSON.stringify(normalized),
      });
      if (!res.ok) {
        failed.push({
          number,
          preview: questionPreview(el.questionText),
          reason: await pipelineErrorReason(res),
        });
        return;
      }
      const result = (await res.json().catch(() => null)) as PipelinePublishResponse | null;
      if (result?.held) {
        heldCount++;
        await holdPossibleDuplicate(db, input.id, number, normalized, result.decision);
        return;
      }
      publishCount++;
      if (result?.occurrence_created) addedCount++;
    } catch (err) {
      failed.push({
        number,
        preview: questionPreview(el.questionText),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Each /publish is several sequential round trips to the database, so publishing a 50-question
  // batch one at a time took well over a minute with no feedback. The first question is published
  // alone — it creates the batch's shared exam variant/session/subject/question-set rows, which
  // concurrent first-time inserts would race on — and the rest follow PUBLISH_CONCURRENCY at a
  // time. Numbers are fixed up front from each question's position, so order never depends on
  // which request finishes first.
  if (publishable.length > 0) {
    await publishOne(publishable[0], 1);
    let next = 1;
    const worker = async () => {
      while (next < publishable.length) {
        const index = next++;
        await publishOne(publishable[index], index + 1);
      }
    };
    await Promise.all(Array.from({ length: PUBLISH_CONCURRENCY }, worker));
  }
  failed.sort((a, b) => a.number - b.number);

  // Includes decisions still open from an earlier attempt, not just ones held just now.
  const pendingDecisions = await countPendingDecisions(db, input.id);
  const counts = {
    published: publishCount,
    added: addedCount,
    alreadyInExam: publishCount - addedCount,
    held: heldCount,
    pendingDecisions,
    failed,
  };

  // A batch is approved only when every question is published or decided. Anything else leaves it
  // pending — in the review queue, where approving again retries (publishing is idempotent) and
  // possible duplicates wait for their decisions. (Approving regardless once dropped 25 batches
  // from the queue with nothing published.)
  if (failed.length > 0 || pendingDecisions > 0) {
    await writeAuditLog(db, {
      actorId,
      action:
        failed.length > 0 ? "approve_scraped_question_failed" : "approve_scraped_question_held",
      entityType: "scraped_question",
      entityId: input.id,
      oldValue: { status: "pending" },
      newValue: { status: "pending", ...counts },
    });
    const status = failed.length > 0 ? "not_approved" : "needs_decisions";
    return { success: false, status, message: describeReviewResult(status, counts), ...counts };
  }

  await db
    .update(scrapedQuestions)
    .set({ status: "approved" })
    .where(eq(scrapedQuestions.id, input.id));

  await writeAuditLog(db, {
    actorId,
    action: "approve_scraped_question",
    entityType: "scraped_question",
    entityId: input.id,
    oldValue: { status: "pending" },
    newValue: { status: "approved", ...counts },
  });

  return {
    success: true,
    status: "approved",
    message: describeReviewResult("approved", counts),
    ...counts,
  };
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

  // ─── Feature flags ───────────────────────────────────────────────────────────
  // Each flag with its label, description, default and current state, for the admin Settings
  // page. The flags themselves are defined in lib/feature-flags.ts.
  listFeatureFlags: adminProcedure
    .route({ method: "GET", path: "/admin/feature-flags", summary: "List feature flags" })
    .handler(async () => {
      const db = getDb();
      const states = await getFeatureFlagStates(db);
      const overrides = await db.select().from(featureFlags);
      return FEATURE_FLAG_KEYS.map((key) => {
        const override = overrides.find((row) => row.key === key);
        return {
          key,
          label: FEATURE_FLAGS[key].label,
          description: FEATURE_FLAGS[key].description,
          defaultEnabled: FEATURE_FLAGS[key].defaultEnabled,
          enabled: states[key],
          updatedAt: override?.updatedAt ?? null,
        };
      });
    }),

  setFeatureFlag: adminProcedure
    .route({
      method: "POST",
      path: "/admin/feature-flags",
      summary: "Turn a feature flag on or off",
    })
    .input(z.object({ key: z.string(), enabled: z.boolean() }))
    .handler(async ({ input, context }) => {
      if (!isFeatureFlagKey(input.key)) {
        throw new ORPCError("BAD_REQUEST", { message: `Unknown feature flag "${input.key}".` });
      }
      const db = getDb();
      const before = (await getFeatureFlagStates(db))[input.key];
      await db
        .insert(featureFlags)
        .values({ key: input.key, enabled: input.enabled, updatedBy: context.user.id })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled: input.enabled, updatedBy: context.user.id, updatedAt: new Date() },
        });
      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "set_feature_flag",
        entityType: "feature_flag",
        entityId: input.key,
        oldValue: { enabled: before },
        newValue: { enabled: input.enabled },
      });
      return { key: input.key, enabled: input.enabled };
    }),

  // ─── Exam categories (exam_types) ────────────────────────────────────────────
  // The only way categories are created or removed — nothing seeds them. The public directory's
  // category tabs (exams.listTypes) read the same table, so changes show up on the site
  // immediately.

  listExamTypes: adminProcedure
    .route({ method: "GET", path: "/admin/exam-types", summary: "List exam categories" })
    .handler(async () => {
      const db = getDb();
      const rows = await db
        .select({
          id: examTypes.id,
          slug: examTypes.slug,
          label: examTypes.label,
          description: examTypes.description,
          hasProgramHierarchy: examTypes.hasProgramHierarchy,
          // Fully qualified on purpose: an interpolated ${examTypes.id} renders as a bare "id",
          // which inside this subquery resolves to exams.id and always counts zero.
          examCount: sql<number>`(SELECT COUNT(*)::int FROM exams e WHERE e.exam_type_id = "exam_types"."id")`,
        })
        .from(examTypes)
        .orderBy(examTypes.label);
      return rows;
    }),

  createExamType: adminProcedure
    .route({ method: "POST", path: "/admin/exam-types", summary: "Add an exam category" })
    .input(
      z.object({
        label: z.string().trim().min(2).max(60),
        description: z.string().trim().max(300).optional(),
        hasProgramHierarchy: z.boolean().default(false),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      const slug = slugify(input.label);
      if (!slug) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The name needs at least one letter or digit.",
        });
      }
      const [created] = await db
        .insert(examTypes)
        .values({
          slug,
          label: input.label,
          description: input.description || null,
          hasProgramHierarchy: input.hasProgramHierarchy,
        })
        .onConflictDoNothing({ target: examTypes.slug })
        .returning();
      if (!created) {
        throw new ORPCError("CONFLICT", {
          message: `A category with the slug "${slug}" already exists.`,
        });
      }
      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "create_exam_type",
        entityType: "exam_type",
        entityId: created.id,
        newValue: { slug, label: input.label },
      });
      return created;
    }),

  deleteExamType: adminProcedure
    .route({ method: "DELETE", path: "/admin/exam-types/{id}", summary: "Remove an exam category" })
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const examType = await db.query.examTypes.findFirst({
        where: (t, { eq: eqOp }) => eqOp(t.id, input.id),
      });
      if (!examType) {
        throw new ORPCError("NOT_FOUND", { message: "That category no longer exists." });
      }
      const [{ val: examCount }] = await db
        .select({ val: count(exams.id) })
        .from(exams)
        .where(eq(exams.examTypeId, examType.id));
      if (examCount > 0) {
        // exams.exam_type_id is NOT NULL with no cascade — an exam can't exist without a category.
        throw new ORPCError("BAD_REQUEST", {
          message: `"${examType.label}" is used by ${examCount} exam(s). Move or remove those exams first.`,
        });
      }
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "delete_exam_type",
        entityType: "exam_type",
        entityId: examType.id,
        oldValue: { slug: examType.slug, label: examType.label },
      });
      return { success: true };
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

      // Everything in the public schema except these is wiped. Computed from the live schema
      // rather than a hand-written list so a newly added table is wiped by default instead of
      // silently surviving. Kept: sign-in (users/accounts/sessions/verifications), plus the two
      // configuration tables the app can't function without — exam_types (directory categories,
      // required by ensureExamRegistered) and sources (the scraper registry and fetch allowlist,
      // synced from each connector's source.yaml). Drizzle's migration journal lives in the
      // separate "drizzle" schema and is never touched.
      const tables = (
        await db.execute(sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `)
      ).rows
        .map((r) => (r as { table_name: string }).table_name)
        .filter((t) => !WIPE_DATABASE_KEEP_TABLES.includes(t));

      // Count what's about to be destroyed *before* destroying it — afterwards every one of these
      // reads back as zero, so this is the only chance to record what was actually wiped.
      const affectedCounts: Record<string, number> = {};
      for (const t of tables) {
        const res = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(t)}`);
        affectedCounts[t] = (res.rows[0] as { n: number }).n;
      }

      try {
        // One statement, so it's atomic: either every table is emptied or none is. Deliberately
        // no CASCADE — Postgres requires every table referencing a truncated one to be in the
        // same statement, so if a kept table ever gains a foreign key into a wiped one this
        // fails loudly instead of cascading into (and emptying) the kept table.
        await db.execute(
          sql`TRUNCATE TABLE ${sql.join(
            tables.map((t) => sql.identifier(t)),
            sql`, `,
          )}`,
        );
      } catch (err: any) {
        console.error("[WIPE DATABASE ERROR]", err);
        // Nothing was wiped (the TRUNCATE is atomic), so audit_logs is intact to record this.
        await writeAuditLog(db, {
          actorId: context.user.id,
          action: "wipe_database_failed",
          entityType: "database",
          entityId: "all",
          oldValue: affectedCounts,
          newValue: { error: err?.message ?? String(err) },
        });
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err?.message || "Failed to wipe database",
        });
      }

      // audit_logs is itself one of the wiped tables, so the record of this wipe is written
      // afterwards — it becomes the first row of the fresh log (docs/roadmap/engineering-roadmap.md
      // item 6).
      await writeAuditLog(db, {
        actorId: context.user.id,
        action: "wipe_database",
        entityType: "database",
        entityId: "all",
        oldValue: affectedCounts,
        newValue: { kept: WIPE_DATABASE_KEEP_TABLES },
      });

      console.log(`[WIPE DATABASE] Wiped by ${context.user.email}:`, affectedCounts);
      return { success: true, wiped: affectedCounts, kept: WIPE_DATABASE_KEEP_TABLES };
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

      // docs/roadmap/engineering-roadmap.md item 20: delegates to apps/pipeline's dedupe stage —
      // the one deduplication implementation — instead of this route's own ilike-based check,
      // which only ever compared a scraped item's first 30 characters against questions.questionText
      // with no exam/year context, so it couldn't tell a real duplicate from the same question
      // legitimately reappearing in a different exam or year.
      // Shared across every batch in this request: the exam list, and each exam's published
      // question texts (many batches usually belong to the same few exams).
      // Possible duplicates still waiting for a decision, per batch.
      const pendingDecisionRows = await db
        .select({ batchId: duplicateReviews.scrapedQuestionId, n: count() })
        .from(duplicateReviews)
        .where(eq(duplicateReviews.status, "pending"))
        .groupBy(duplicateReviews.scrapedQuestionId);
      const pendingDecisionsByBatch = new Map(
        pendingDecisionRows.map((r) => [r.batchId, Number(r.n)]),
      );
      const examRows = await db
        .select({ slug: exams.slug, urlMatchPattern: exams.urlMatchPattern })
        .from(exams);
      const textsByExam = new Map<string, Promise<string[]>>();
      const examTexts = (slug: string) => {
        if (!textsByExam.has(slug)) textsByExam.set(slug, loadExamQuestionTexts(db, slug));
        return textsByExam.get(slug) as Promise<string[]>;
      };
      const items = await Promise.all(
        pending.map(async (row) => {
          let parsedData: any = row.parsedData;
          if (typeof parsedData === "string") {
            try {
              parsedData = JSON.parse(parsedData);
            } catch (_e) {}
          }
          const meta = parsedData?.metadata || {};
          const elements = parsedData?.extractedElements || [];
          // How much of this batch the exam doesn't have yet — a re-scrape of an assessment is
          // mostly questions already published, and only the new ones will be added.
          const examSlug = await resolveRegisteredExamSlug(
            db,
            meta.exam || meta.targetExam || "",
            row.sourceUrl,
            examRows,
          );
          const { newCount, existingCount } = countNewQuestions(
            elements
              .map((el: { questionText?: unknown }) => el?.questionText)
              .filter((text: unknown): text is string => typeof text === "string" && text !== ""),
            examSlug ? await examTexts(examSlug) : [],
          );

          return {
            ...row,
            qualityIssues: reviewQualityIssues(elements),
            newQuestionCount: newCount,
            pendingDecisions: pendingDecisionsByBatch.get(row.id) ?? 0,
            existingQuestionCount: existingCount,
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
      return processOneReviewItem(db, context.user.id, input);
    }),

  // ─── Possible-duplicate decisions ──────────────────────────────────────────
  // The side-by-side view for one batch: each held question next to the published question it
  // resembles — wording, options, correct answers, and where the existing one appears.
  listDuplicateReviews: adminProcedure
    .route({
      method: "GET",
      path: "/admin/review/duplicates",
      summary: "List a batch's possible duplicates awaiting a decision",
    })
    .input(z.object({ batchId: z.string() }))
    .handler(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(duplicateReviews)
        .where(eq(duplicateReviews.scrapedQuestionId, input.batchId))
        .orderBy(duplicateReviews.questionNumber);
      if (rows.length === 0) return [];

      const existingIds = [...new Set(rows.map((r) => r.existingQuestionId))];
      const existing = await db.execute(sql`
        SELECT q.id, q.question_text AS "text",
          (SELECT json_agg(json_build_object('key', o.option_key, 'text', o.option_text,
                    'correct', EXISTS (SELECT 1 FROM question_answers a WHERE a.correct_option_id = o.id))
                  ORDER BY o.sequence)
             FROM question_options o WHERE o.question_id = q.id) AS options,
          (SELECT json_agg(DISTINCT e.name || ' · ' || qs.title)
             FROM question_occurrences oc
             JOIN question_sets qs ON qs.id = oc.question_set_id
             JOIN exam_variants ev ON ev.id = qs.exam_variant_id
             JOIN exams e ON e.id = ev.exam_id
            WHERE oc.question_id = q.id) AS "appearsIn"
        FROM questions q
        WHERE q.id IN (${sql.join(
          existingIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      `);
      const byId = new Map(
        (
          existing.rows as unknown as {
            id: string;
            text: string;
            options: { key: string; text: string; correct: boolean }[] | null;
            appearsIn: string[] | null;
          }[]
        ).map((row) => [row.id, row]),
      );

      return rows.map((row) => {
        const candidate = row.candidate as {
          question_text: string;
          options: { key: string; text: string }[];
          answer: { correct_key?: string; correct_keys?: string[] };
        };
        const correctKeys = new Set(
          candidate.answer.correct_keys ??
            (candidate.answer.correct_key ? [candidate.answer.correct_key] : []),
        );
        const match = byId.get(row.existingQuestionId);
        return {
          id: row.id,
          questionNumber: row.questionNumber,
          similarity: row.similarity,
          optionsMatch: row.optionsMatch,
          answerMatch: row.answerMatch,
          suggestion: row.suggestion as "same" | "different",
          status: row.status as "pending" | "same" | "same_new" | "different" | "skipped",
          candidate: {
            text: candidate.question_text,
            options: candidate.options.map((o) => ({ ...o, correct: correctKeys.has(o.key) })),
          },
          existing: {
            id: row.existingQuestionId,
            text: match?.text ?? "(question no longer exists)",
            options: match?.options ?? [],
            appearsIn: match?.appearsIn ?? [],
          },
        };
      });
    }),

  // Approve a batch together with the admin's choices for its possible duplicates — what the
  // review page's Approve & Publish sends. Each choice is applied (keep the published version,
  // keep the new version, keep both as different questions, or skip the new one), then the batch
  // is approved once: it completes if nothing is left undecided, and any question without a choice
  // simply stays for review. A choice that can't be applied is reported and left open.
  approveWithDuplicateChoices: adminProcedure
    .route({
      method: "POST",
      path: "/admin/review/approve-with-choices",
      summary: "Apply choices for a batch's possible duplicates, then approve the batch",
    })
    .input(
      z.object({
        batchId: z.string(),
        choices: z.array(
          z.object({
            id: z.string(),
            choice: z.enum(["keep_existing", "keep_new", "keep_both", "skip"]),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      const choiceErrors: string[] = [];
      for (const { id, choice } of input.choices) {
        try {
          if (choice === "keep_existing") await resolveDuplicate(db, context.user.id, id, "same");
          if (choice === "keep_new") {
            await resolveDuplicate(db, context.user.id, id, "same", "new");
          }
          if (choice === "keep_both") await resolveDuplicate(db, context.user.id, id, "different");
          if (choice === "skip") await resolveDuplicate(db, context.user.id, id, "skip");
        } catch (err) {
          choiceErrors.push(err instanceof Error ? err.message : String(err));
        }
      }
      const batch = await processOneReviewItem(db, context.user.id, {
        id: input.batchId,
        action: "approve",
      });
      return { ...batch, choiceErrors };
    }),

  // docs/roadmap/engineering-roadmap.md item 21: review.tsx's batch approve/discard actions used
  // to loop processReviewItem sequentially — one browser round-trip per item, and the network cost
  // scaled with queue size. This does the same per-item work (processOneReviewItem, shared with
  // the single-item procedure above so there is one place that decides how a review item is
  // processed) but as a single request regardless of how many items are in the batch.
  processReviewBatch: adminProcedure
    .route({
      method: "POST",
      path: "/admin/review/process-batch",
      summary: "Process multiple review items in one request",
    })
    .input(
      z.object({
        ids: z.array(z.string()).min(1),
        action: z.enum(["approve", "reject"]),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      // One batch at a time: each approval already publishes PUBLISH_CONCURRENCY questions in
      // parallel, and running every batch at once on top of that multiplied the load (nine
      // batches meant ~100 simultaneous publishes against the pipeline and the database).
      const results: Array<{ id: string; success: boolean; message: string }> = [];
      for (const id of input.ids) {
        try {
          const result = await processOneReviewItem(db, context.user.id, {
            id,
            action: input.action,
          });
          results.push({ id, ...result });
        } catch (err) {
          results.push({
            id,
            success: false,
            message: (err instanceof Error ? err.message : undefined) || "Failed to process item",
          });
        }
      }
      const succeeded = results.filter((r) => r.success).length;
      return {
        success: succeeded === results.length,
        message: `Processed ${succeeded}/${results.length} item(s).`,
        results,
      };
    }),

  // Drives the site-selector cards in apps/web/app/routes/admin/scraping.tsx — replaces the
  // hardcoded TARGET_WEBSITES constant. See docs/roadmap/engineering-roadmap.md item 14: sources
  // are configuration, not code, so adding one is a source.yaml file plus a sync, never a
  // frontend change.
  listSources: adminProcedure
    .route({
      method: "GET",
      path: "/admin/sources",
      summary: "List registered scrape sources with health status",
    })
    .handler(async () => {
      const db = getDb();
      const [rows, healthBySource] = await Promise.all([
        // Disabled sources can't be fetched from (they're off the scraper's allowlist) — including
        // ones marked not onboarded (docs/sources/not-onboarded.md) — so they aren't offered here.
        db.select().from(sources).where(eq(sources.enabled, true)).orderBy(sources.name),
        computeSourceHealthStats(db),
      ]);
      return rows.map((source) => ({
        ...source,
        // Set wherever scraping is locked (everywhere but local development); the scraping page
        // shows the source as locked.
        lockedReason: scrapingLockReason(),
        health: {
          ...(healthBySource.get(source.name) ?? EMPTY_SOURCE_HEALTH_STATS),
          degraded: isSourceDegraded(source.consecutiveFailures),
        },
      }));
    }),

  // One row per scrape run for apps/web/app/routes/admin/scraping.tsx: the pipeline job (status,
  // per-stage counts, durations, errors) together with the review batch it produced, linked by
  // the jobId the scraper stamps into the batch's metadata. Replaces three separate panels — a
  // text rendering of these same jobs, a job table, and a batch table — that each showed one
  // slice of the same runs.
  listScrapeRuns: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/runs",
      summary: "Recent scrape runs with their stages and the review batch each produced",
    })
    .handler(async () => {
      const db = getDb();
      const jobs = await db.query.pipelineJobs.findMany({
        orderBy: (t, { desc: descOrder }) => [descOrder(t.createdAt)],
        limit: 30,
        with: { stages: { orderBy: (t, { asc }) => [asc(t.createdAt)] } },
      });
      const jobIds = jobs.map((job) => job.id);
      const batches = jobIds.length
        ? await db
            .select({
              id: scrapedQuestions.id,
              status: scrapedQuestions.status,
              jobId: sql<string>`${scrapedQuestions.parsedData}->'metadata'->>'jobId'`,
              exam: sql<string | null>`${scrapedQuestions.parsedData}->'metadata'->>'exam'`,
              examTitle: sql<
                string | null
              >`${scrapedQuestions.parsedData}->'metadata'->>'examTitle'`,
              logoUrl: sql<string | null>`${scrapedQuestions.parsedData}->'metadata'->>'logoUrl'`,
              questionCount: sql<number>`jsonb_array_length(coalesce(${scrapedQuestions.parsedData}->'extractedElements', '[]'::jsonb))`,
            })
            .from(scrapedQuestions)
            .where(
              sql`${scrapedQuestions.parsedData}->'metadata'->>'jobId' in (${sql.join(
                jobIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            )
        : [];
      const batchByJob = new Map(batches.map((batch) => [batch.jobId, batch]));

      return jobs.map((job) => {
        const configuration = (job.configuration ?? {}) as { url?: string; target_exam?: string };
        return {
          id: job.id,
          sourceId: job.sourceId,
          status: job.status,
          url: configuration.url ?? null,
          targetExam: configuration.target_exam ?? null,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          errorSummary: job.errorSummary,
          stages: job.stages.map((stage) => ({
            id: stage.id,
            stage: stage.stage,
            status: stage.status,
            discoveredCount: stage.discoveredCount,
            processedCount: stage.processedCount,
            failedCount: stage.failedCount,
            duplicateCount: stage.duplicateCount,
            skippedCount: stage.skippedCount,
            durationMs: stage.durationMs,
            errorDetail: stage.errorDetail,
          })),
          batch: batchByJob.get(job.id) ?? null,
        };
      });
    }),

  // Which local-only services are locked in this environment (null = available), so admin pages
  // can show why instead of offering buttons that can only fail — see lib/local-only-services.ts.
  getLocalOnlyStatus: adminProcedure
    .route({
      method: "GET",
      path: "/admin/local-only-status",
      summary: "Whether scraping and publishing are available in this environment",
    })
    .handler(() => ({
      scrapingLockedReason: scrapingLockReason(),
      publishingLockedReason: publishingLockReason(),
    })),

  getScraperHealth: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/health",
      summary: "Check scraper service health and configuration",
    })
    .handler(async () => {
      // Polled by the scraping page — where scraping is locked, say so instead of probing.
      const lockedReason = scrapingLockReason();
      if (lockedReason) return { status: "locked" as const, reason: lockedReason };
      try {
        const res = await fetchScraper("/health");
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          // `body` is the scraper's own /health response, which has its own `status` field
          // (e.g. "healthy") — spreading it after the literal would silently overwrite "online"
          // with that value, so the frontend's `status === "online"` check (admin/scraping.tsx)
          // always failed and disabled the scrape buttons even when the scraper was reachable and
          // fine. `status: "online"` must be applied last so the normalized value always wins.
          return { ...body, status: "online" as const };
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

  getMsLearnAuthStatus: adminProcedure
    .route({
      method: "GET",
      path: "/admin/scrape/ms-learn/auth/status",
      summary: "Check whether an authenticated MS Learn session is currently open",
    })
    .handler(async () => {
      // Polled by the scraping page even when MS Learn isn't selected — where scraping is locked,
      // report "not signed in" rather than an error on every poll.
      if (scrapingLockReason()) return { authenticated: false };
      const res = await fetchScraper("/scrape/ms-learn/auth/status");
      if (!res.ok) {
        // Surfaced, not swallowed: mapping every failure to "not authenticated" hid a scraper
        // process that predated this endpoint (404) behind a UI that simply never showed Sign Out.
        throw new ORPCError("BAD_GATEWAY", {
          message: `Scraper returned ${res.status} while checking Microsoft Learn session status.`,
        });
      }
      return (await res.json()) as { authenticated: boolean };
    }),

  signOutMsLearnAuth: adminProcedure
    .route({
      method: "POST",
      path: "/admin/scrape/ms-learn/auth/signout",
      summary: "Discard the currently open authenticated MS Learn session",
    })
    .handler(async () => {
      const res = await fetchScraper("/scrape/ms-learn/auth/signout", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ORPCError("BAD_GATEWAY", {
          message: body?.detail || `Scraper returned ${res.status} while signing out.`,
        });
      }
      return body;
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
        // No default cap: an omitted maxQuestions scrapes the whole assessment.
        maxQuestions,
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
            max_questions: maxQuestions ?? null,
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
