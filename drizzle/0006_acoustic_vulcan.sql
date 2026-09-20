CREATE TYPE "public"."robots_review_status" AS ENUM('not_reviewed', 'reviewed_allowed', 'reviewed_disallowed');--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"source_type" text,
	"connector_name" text NOT NULL,
	"requires_auth" boolean DEFAULT false NOT NULL,
	"crawl_policy" jsonb,
	"rate_limit" jsonb,
	"robots_review_status" "robots_review_status" DEFAULT 'not_reviewed' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_crawl_at" timestamp with time zone,
	"last_successful_crawl_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled");