#!/usr/bin/env tsx
/**
 * pnpm db:seed:dev
 *
 * Fills a local development database with invented demo content and a local admin account, so a
 * fresh checkout has something to click through. Safe to re-run: every step is idempotent.
 *
 * 1. Registers two demo exams (organization, exam types, exams). Publishing requires the exam to be
 *    registered first — in production that happens when a reviewer approves a batch.
 * 2. Publishes the demo question sets in scripts/dev-seed/content/ through the real pipeline
 *    (apps/pipeline's Markdown connector), so the data has exactly the shape published content has.
 * 3. Creates the local admin account (DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD) with email/password
 *    sign-in, which only exists in development — see packages/auth's isEmailPasswordEnabled().
 *
 * Refuses to run against Neon: this is for local databases only, never production.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createBetterAuthInstance } from "@prepora/auth";
import { exams, examTypes, getDb, isNeonUrl, organizations } from "@prepora/db";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CONTENT_DIR = resolve(REPO_ROOT, "scripts/dev-seed/content");
const PIPELINE_DIR = resolve(REPO_ROOT, "apps/pipeline");
const PIPELINE_PYTHON = resolve(PIPELINE_DIR, "venv/bin/python");

const DEMO_EXAMS = [
  {
    slug: "demo-cloud-basics",
    name: "Demo Cloud Basics",
    description:
      "An invented certification-style exam for local development: availability, security, storage and scaling basics.",
    examType: { slug: "certification", label: "Certification" },
  },
  {
    slug: "demo-civil-engineering",
    name: "Demo Civil Engineering",
    description:
      "An invented competitive-exam paper for local development: structural analysis fundamentals.",
    examType: { slug: "competitive", label: "Competitive" },
  },
];

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function registerDemoExams(db: ReturnType<typeof getDb>) {
  await db
    .insert(organizations)
    .values({ name: "Prepora Demo", slug: "prepora-demo", jurisdiction: "global" })
    .onConflictDoNothing({ target: organizations.slug });
  const org = await db.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.slug, "prepora-demo"),
  });
  if (!org) fail("Could not create the demo organization.");

  for (const demo of DEMO_EXAMS) {
    await db
      .insert(examTypes)
      .values(demo.examType)
      .onConflictDoNothing({ target: examTypes.slug });
    const examType = await db.query.examTypes.findFirst({
      where: (t, { eq }) => eq(t.slug, demo.examType.slug),
    });
    if (!examType) fail(`Could not create exam type ${demo.examType.slug}.`);

    await db
      .insert(exams)
      .values({
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .onConflictDoNothing({ target: exams.slug });
  }
  console.log(`✓ Registered ${DEMO_EXAMS.length} demo exams`);
}

function publishDemoQuestions() {
  if (!existsSync(PIPELINE_PYTHON)) {
    fail(
      "apps/pipeline/venv is missing — run `pnpm bootstrap` first (it creates the Python environments).",
    );
  }
  // import-markdown publishes idempotently: re-running it adds nothing that's already there.
  const result = spawnSync(
    PIPELINE_PYTHON,
    ["-m", "prepora_pipeline.cli", "import-markdown", "--content-dir", CONTENT_DIR],
    { cwd: PIPELINE_DIR, env: process.env, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    fail("Publishing the demo questions failed (output above).");
  }
  const summary = result.stdout.trim().split("\n").at(-1);
  console.log(`✓ Published demo question sets through the pipeline (${summary})`);
}

async function createDevAdmin() {
  const email = process.env.DEV_ADMIN_EMAIL;
  const password = process.env.DEV_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      "• DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD not set — skipping the local admin account",
    );
    return;
  }
  const admins = (process.env.ADMIN_USERS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (!admins.includes(email.toLowerCase())) {
    console.warn(`⚠ ${email} is not in ADMIN_USERS, so it will sign in as a regular user.`);
  }
  try {
    await createBetterAuthInstance().api.signUpEmail({
      body: { email, password, name: "Local Admin" },
    });
    console.log(`✓ Created local admin account ${email} (password: DEV_ADMIN_PASSWORD in .env)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(message)) {
      console.log(`✓ Local admin account ${email} already exists`);
    } else {
      throw err;
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set — run `pnpm bootstrap`, or copy .env.example to .env.");
  if (isNeonUrl(url)) {
    fail(
      "DATABASE_URL points at Neon. The dev seed only runs against a local database — it would " +
        "otherwise write demo exams and a demo admin into a real environment.",
    );
  }
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    fail(
      'NODE_ENV must be "development" (or "test") to seed — it is set in .env by `pnpm bootstrap`.',
    );
  }

  const db = getDb();
  await registerDemoExams(db);
  publishDemoQuestions();
  await createDevAdmin();
  console.log("\nDone. Start the app with `pnpm dev` and open http://localhost:3000");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
