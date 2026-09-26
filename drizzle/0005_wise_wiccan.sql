CREATE TYPE "public"."pipeline_job_status" AS ENUM('queued', 'running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "pipeline_job_stages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"stage" text NOT NULL,
	"status" "pipeline_job_status" DEFAULT 'queued' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_job_stages_job_id_stage_unique" UNIQUE("job_id","stage")
);
--> statement-breakpoint
CREATE TABLE "pipeline_jobs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"job_type" text NOT NULL,
	"status" "pipeline_job_status" DEFAULT 'queued' NOT NULL,
	"trigger_type" text NOT NULL,
	"requested_by" text,
	"idempotency_key" text,
	"configuration" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "pipeline_job_stages" ADD CONSTRAINT "pipeline_job_stages_job_id_pipeline_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."pipeline_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_job_stages_job_id_idx" ON "pipeline_job_stages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pipeline_jobs_source_id_idx" ON "pipeline_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "pipeline_jobs_status_idx" ON "pipeline_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_jobs_created_at_idx" ON "pipeline_jobs" USING btree ("created_at");