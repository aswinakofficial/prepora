ALTER TABLE "pipeline_jobs" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD COLUMN "run_position" integer;--> statement-breakpoint
CREATE INDEX "pipeline_jobs_run_id_idx" ON "pipeline_jobs" USING btree ("run_id");