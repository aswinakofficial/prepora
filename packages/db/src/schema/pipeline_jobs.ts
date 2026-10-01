import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { id, pipelineJobStatusEnum, timestamps } from "./shared.ts";
import { users } from "./users.ts";

// ─── Pipeline Jobs ──────────────────────────────────────────────────────────
// Every pipeline run is a database record — see docs/roadmap/engineering-roadmap.md item 13.
// Replaces main.py's module-level `seen_jobs` set (in-memory, resets on restart, not shared
// across workers) and /tmp/ms_learn_scraper.log (unreadable from a deployed instance). The only
// writer of these tables is apps/pipeline/prepora_pipeline/core/jobs.py.

export const pipelineJobs = pgTable(
  "pipeline_jobs",
  {
    id: id(),
    // A source slug (e.g. "ms-learn", "generic") — item 14's sources table will give this a real
    // FK target; kept as free text here since that table doesn't exist yet.
    sourceId: text("source_id").notNull(),
    jobType: text("job_type").notNull(),
    status: pipelineJobStatusEnum("status").notNull().default("queued"),
    triggerType: text("trigger_type").notNull(), // "manual" | "scheduled" | ...
    requestedBy: text("requested_by").references(() => users.id),
    // The database-backed replacement for the in-memory `seen_jobs` set: re-submitting the same
    // key returns the existing job instead of starting a second one.
    idempotencyKey: text("idempotency_key").unique(),
    configuration: jsonb("configuration"),
    // Bulk scrape runs ("scrape these 43 exams"): every job queued together shares a run_id, and
    // run_position is its place in that run. The local scraper service works through queued jobs
    // on its own (apps/scraper's queue worker), so a run survives the admin page being refreshed
    // or closed. Null for one-off jobs.
    runId: text("run_id"),
    runPosition: integer("run_position"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorSummary: text("error_summary"),
    ...timestamps,
  },
  (t) => [
    index("pipeline_jobs_source_id_idx").on(t.sourceId),
    index("pipeline_jobs_status_idx").on(t.status),
    index("pipeline_jobs_created_at_idx").on(t.createdAt),
    index("pipeline_jobs_run_id_idx").on(t.runId),
  ],
);

export const pipelineJobStages = pgTable(
  "pipeline_job_stages",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => pipelineJobs.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(), // discover | fetch | extract | normalize | validate | dedupe | enrich | publish
    status: pipelineJobStatusEnum("status").notNull().default("queued"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    processedCount: integer("processed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    // Change-detection breakdown (item 17) — deliberately separate from the generic counts above
    // rather than overloading them, since "how many were new vs. changed vs. unchanged vs.
    // flagged as removed" is a distinct, queryable fact a caller may want without having to infer
    // it from skipped/processed/duplicate.
    newCount: integer("new_count").notNull().default(0),
    changedCount: integer("changed_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    durationMs: integer("duration_ms"),
    errorDetail: text("error_detail"),
    ...timestamps,
  },
  (t) => [
    index("pipeline_job_stages_job_id_idx").on(t.jobId),
    unique("pipeline_job_stages_job_id_stage_unique").on(t.jobId, t.stage),
  ],
);

export const pipelineJobsRelations = relations(pipelineJobs, ({ one, many }) => ({
  requester: one(users, { fields: [pipelineJobs.requestedBy], references: [users.id] }),
  stages: many(pipelineJobStages),
}));

export const pipelineJobStagesRelations = relations(pipelineJobStages, ({ one }) => ({
  job: one(pipelineJobs, { fields: [pipelineJobStages.jobId], references: [pipelineJobs.id] }),
}));
