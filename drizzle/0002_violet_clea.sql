CREATE TABLE "courses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_variant_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"code" text,
	"semester" integer,
	"credits" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_variant_subject_unique" UNIQUE("exam_variant_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_variant_id" text NOT NULL,
	"label" text NOT NULL,
	"year" integer,
	"session_code" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" "publishing_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_types" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"has_program_hierarchy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"official_url" text,
	"logo_url" text,
	"jurisdiction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "exam_variants" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "exam_type_id" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "url_match_pattern" text;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "exam_session_id" text;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "shift_label" text;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_exam_variant_id_exam_variants_id_fk" FOREIGN KEY ("exam_variant_id") REFERENCES "public"."exam_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_exam_variant_id_exam_variants_id_fk" FOREIGN KEY ("exam_variant_id") REFERENCES "public"."exam_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_exam_variant_id_idx" ON "courses" USING btree ("exam_variant_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_exam_variant_id_idx" ON "exam_sessions" USING btree ("exam_variant_id");--> statement-breakpoint
CREATE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_exam_type_id_exam_types_id_fk" FOREIGN KEY ("exam_type_id") REFERENCES "public"."exam_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_sets_exam_session_id_idx" ON "question_sets" USING btree ("exam_session_id");