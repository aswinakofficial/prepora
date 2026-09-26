ALTER TABLE "topics" DROP CONSTRAINT "topics_slug_unique";--> statement-breakpoint
DROP INDEX "exam_variants_slug_idx";--> statement-breakpoint
DROP INDEX "question_sets_year_idx";--> statement-breakpoint
DROP INDEX "question_sets_exam_year_idx";--> statement-breakpoint
DROP INDEX "topics_slug_idx";--> statement-breakpoint
ALTER TABLE "exams" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ALTER COLUMN "exam_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_sets" ALTER COLUMN "exam_session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN "organization";--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "question_sets" DROP COLUMN "year";--> statement-breakpoint
ALTER TABLE "exam_variants" ADD CONSTRAINT "exam_variants_exam_id_slug_unique" UNIQUE("exam_id","slug");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_slug_unique" UNIQUE("subject_id","slug");