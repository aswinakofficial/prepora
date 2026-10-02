CREATE TYPE "public"."answer_provenance" AS ENUM('official_final', 'official_provisional', 'official_sample_key', 'reviewer', 'ai_suggested_confirmed', 'community');--> statement-breakpoint
CREATE TYPE "public"."answer_status" AS ENUM('scored', 'marks_to_all', 'dropped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."key_status" AS ENUM('none', 'provisional', 'final', 'revised');--> statement-breakpoint
CREATE TYPE "public"."paper_kind" AS ENUM('past_paper', 'official_practice', 'sample_paper', 'model_paper');--> statement-breakpoint
-- Back-filled by a temporary default, then dropped: every writer states these (docs/specs/03-paper-structure-min.md).
ALTER TABLE "question_sets" ADD COLUMN "paper_kind" "paper_kind" DEFAULT 'official_practice' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_sets" ALTER COLUMN "paper_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "key_status" "key_status" DEFAULT 'final' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_sets" ALTER COLUMN "key_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_answers" ADD COLUMN "numeric_min" numeric;--> statement-breakpoint
ALTER TABLE "question_answers" ADD COLUMN "numeric_max" numeric;--> statement-breakpoint
ALTER TABLE "question_answers" ADD COLUMN "range_group" integer;--> statement-breakpoint
ALTER TABLE "question_answers" ADD COLUMN "provenance" "answer_provenance" DEFAULT 'official_sample_key' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_answers" ALTER COLUMN "provenance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_occurrences" ADD COLUMN "section_label" text;--> statement-breakpoint
ALTER TABLE "question_occurrences" ADD COLUMN "number_label" text;--> statement-breakpoint
ALTER TABLE "question_occurrences" ADD COLUMN "marks" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "question_occurrences" ADD COLUMN "negative_marks" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "question_occurrences" ADD COLUMN "answer_status" "answer_status" DEFAULT 'scored' NOT NULL;