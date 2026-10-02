DROP INDEX "questions_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "questions_slug_unique" ON "questions" USING btree ("slug");