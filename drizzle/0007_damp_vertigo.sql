CREATE TYPE "public"."removed_resource_status" AS ENUM('flagged', 'confirmed_removed', 'restored');--> statement-breakpoint
CREATE TABLE "removed_resources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_slug" text NOT NULL,
	"url" text NOT NULL,
	"last_seen_sha256" text,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status" "removed_resource_status" DEFAULT 'flagged' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "removed_resources_source_slug_url_unique" UNIQUE("source_slug","url")
);
--> statement-breakpoint
ALTER TABLE "pipeline_job_stages" ADD COLUMN "new_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_job_stages" ADD COLUMN "changed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_job_stages" ADD COLUMN "unchanged_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_job_stages" ADD COLUMN "removed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_artifacts" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "raw_artifacts" ADD COLUMN "last_modified" text;--> statement-breakpoint
CREATE INDEX "removed_resources_status_idx" ON "removed_resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "raw_artifacts_source_url_idx" ON "raw_artifacts" USING btree ("source_url");