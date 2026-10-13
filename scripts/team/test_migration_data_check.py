#!/usr/bin/env python3
"""Tests for migration_data_check.py. Run: python3 scripts/team/test_migration_data_check.py (CI runs it)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from migration_data_check import unsafe_statements  # noqa: E402

UNSAFE = [
    'DELETE FROM "questions" WHERE true',
    'UPDATE "questions" SET "status" = \'draft\'',
    'INSERT INTO "exams" ("slug") VALUES (\'x\')',
    'TRUNCATE "questions"',
    'WITH x AS (DELETE FROM "q" RETURNING *) SELECT 1',
    'DROP TABLE "questions"',
    'DROP TYPE "public"."status"',
    'ALTER TABLE "exams" DROP COLUMN "category"',
    'ALTER TABLE "exams" DROP "category"',
    'ALTER TABLE "exams" RENAME COLUMN "a" TO "b"',
    'ALTER TABLE "exams" RENAME TO "tests"',
    "-- harmless comment\nDELETE FROM q",
    # Re-review of #85: code that changes data inside a procedural body.
    "DO $$ BEGIN DELETE FROM questions WHERE true; END $$;",
    "CREATE OR REPLACE FUNCTION f() RETURNS void AS $$ UPDATE questions SET x = 1; $$ LANGUAGE sql",
    "SELECT f()",
    "CALL p()",
    "PREPARE p AS DELETE FROM questions; EXECUTE p",
    "CREATE TRIGGER t AFTER INSERT ON q FOR EACH ROW EXECUTE FUNCTION f()",
    "CREATE RULE r AS ON INSERT TO q DO INSTEAD NOTHING",
    "CREATE TABLE a (x text DEFAULT '--'); DELETE FROM q",
]
SAFE = [
    'CREATE TABLE "x" ("id" uuid PRIMARY KEY, "e" uuid)',
    'ALTER TABLE "x" ADD CONSTRAINT "x_e_fk" FOREIGN KEY ("e") REFERENCES "public"."exams"("id") '
    "ON DELETE set null ON UPDATE no action",
    'ALTER TABLE "x" ADD COLUMN "updated_at" timestamp',
    'ALTER TABLE "x" ALTER COLUMN "y" DROP DEFAULT',
    'ALTER TABLE "x" ALTER COLUMN "y" DROP NOT NULL',
    'ALTER TABLE "x" DROP CONSTRAINT "x_y_unique"',
    'DROP INDEX "questions_slug_idx"',
    'CREATE INDEX "x_idx" ON "x" USING btree ("deleted_at")',
    "-- DELETE FROM q\nCREATE TABLE y (id int)",
    "/* UPDATE q */ CREATE TABLE z (id int)",
    "CREATE TABLE a (x text DEFAULT 'a;DELETE')",
    'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
]

failures = [f"not flagged: {s!r}" for s in UNSAFE if not unsafe_statements(s)]
failures += [f"wrongly flagged: {s!r}" for s in SAFE if unsafe_statements(s)]
for f in failures:
    print(f)
print(f"{len(UNSAFE) + len(SAFE) - len(failures)}/{len(UNSAFE) + len(SAFE)} cases pass")
sys.exit(1 if failures else 0)
