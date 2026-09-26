ALTER TABLE "media" DROP CONSTRAINT "media_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "placement" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "option_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;