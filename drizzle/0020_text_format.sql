CREATE TYPE "public"."text_format" AS ENUM('plain', 'markdown');--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "text_format" text_format DEFAULT 'plain' NOT NULL;