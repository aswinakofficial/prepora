CREATE TABLE "raw_artifacts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"source_slug" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_type" text NOT NULL,
	"http_status" integer,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_artifacts_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE INDEX "raw_artifacts_source_slug_idx" ON "raw_artifacts" USING btree ("source_slug");--> statement-breakpoint
CREATE INDEX "raw_artifacts_fetched_at_idx" ON "raw_artifacts" USING btree ("fetched_at");