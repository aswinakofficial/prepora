-- Trigram search for duplicate detection (apps/pipeline/prepora_pipeline/dedupe/candidates.py).
-- pg_trgm ships with PostgreSQL (contrib) and is available on Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "question_variants_question_text_trgm_idx" ON "question_variants" USING gin ("question_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "questions_question_text_trgm_idx" ON "questions" USING gin ("question_text" gin_trgm_ops);