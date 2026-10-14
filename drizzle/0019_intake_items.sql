CREATE TYPE "public"."intake_status" AS ENUM('ready', 'held', 'in_review', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "intake_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"paper_key" text NOT NULL,
	"edition" text NOT NULL,
	"number" integer NOT NULL,
	"number_label" text,
	"raw_artifact_sha256" text,
	"candidate" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regions" jsonb,
	"parser_version" text NOT NULL,
	"status" "intake_status" NOT NULL,
	"review_batch_id" text,
	"question_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_review_batch_id_scraped_questions_id_fk" FOREIGN KEY ("review_batch_id") REFERENCES "public"."scraped_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_items_question_unique" ON "intake_items" USING btree ("source_id","paper_key","edition","number");--> statement-breakpoint
CREATE INDEX "intake_items_status_idx" ON "intake_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intake_items_paper_key_idx" ON "intake_items" USING btree ("paper_key");--> statement-breakpoint
CREATE INDEX "intake_items_review_batch_idx" ON "intake_items" USING btree ("review_batch_id");