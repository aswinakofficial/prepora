CREATE TABLE "duplicate_reviews" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scraped_question_id" text NOT NULL,
	"question_number" integer NOT NULL,
	"candidate" jsonb NOT NULL,
	"existing_question_id" text NOT NULL,
	"similarity" real NOT NULL,
	"options_match" boolean NOT NULL,
	"answer_match" boolean NOT NULL,
	"suggestion" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_reviews_batch_question_unique" UNIQUE("scraped_question_id","question_number")
);
--> statement-breakpoint
CREATE TABLE "question_variants" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" text NOT NULL,
	"question_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_variants_question_hash_unique" UNIQUE("question_id","content_hash")
);
--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_scraped_question_id_scraped_questions_id_fk" FOREIGN KEY ("scraped_question_id") REFERENCES "public"."scraped_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_existing_question_id_questions_id_fk" FOREIGN KEY ("existing_question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_variants" ADD CONSTRAINT "question_variants_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duplicate_reviews_status_idx" ON "duplicate_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_variants_content_hash_idx" ON "question_variants" USING btree ("content_hash");