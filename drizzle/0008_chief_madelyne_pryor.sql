ALTER TABLE "questions" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "questions_content_hash_idx" ON "questions" USING btree ("content_hash");