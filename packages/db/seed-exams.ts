#!/usr/bin/env tsx
/**
 * One-time seed: the exam_types lookup table, plus real catalog rows for the five Microsoft
 * certifications that used to be hardcoded in packages/api/src/routers/exams.router.ts's
 * (now-deleted) resolveExamMeta()/getExamDescription(). Running this after the item-10 migration
 * is what lets that router's rewritten read path serve the same certifications without the
 * hardcoded lookup — see docs/roadmap/engineering-roadmap.md item 10 and
 * docs/architecture/exam-domain-model.md §17.
 *
 * Idempotent: every insert is `onConflictDoNothing()` keyed on the row's unique slug, so re-running
 * this after the first time is a no-op, not a duplicate-row error.
 *
 * Usage: pnpm --filter @prepora/db db:seed-exams
 */
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../.env") });

import { getDb } from "./src/client.ts";
import {
  examSessions,
  exams,
  examTypes,
  examVariants,
  organizations,
} from "./src/schema/catalog.ts";

const EXAM_TYPES = [
  {
    slug: "certification",
    label: "Certification",
    hasProgramHierarchy: false,
  },
  {
    slug: "competitive",
    label: "Competitive",
    hasProgramHierarchy: false,
  },
  {
    slug: "government",
    label: "Government",
    hasProgramHierarchy: false,
  },
  {
    slug: "university",
    label: "University",
    hasProgramHierarchy: true,
  },
  {
    slug: "school",
    label: "School",
    hasProgramHierarchy: true,
  },
  {
    slug: "professional",
    label: "Professional",
    hasProgramHierarchy: false,
  },
  {
    slug: "other",
    label: "Other",
    hasProgramHierarchy: false,
  },
];

// The five certifications previously hardcoded in exams.router.ts's resolveExamMeta(). Each
// urlMatchPattern is a comma-separated list of substrings matched against a scraped question's
// source URL — the same OR-of-substrings the deleted function used, now data instead of code.
const MICROSOFT_CERTS = [
  {
    slug: "ab-100-agentic-ai",
    name: "AB-100: Agentic AI Business Solutions Architect",
    urlMatchPattern: "ab-100,agentic-ai",
    logoUrl:
      "https://learn.microsoft.com/en-us/media/learn/certification/badges/agentic-ai-business-solutions-architect.svg",
    description:
      "As an AI-first solution architect, you lead the transformation of enterprise operations by envisioning and implementing AI-powered architecture, multi-agent orchestration with Copilot Studio, Azure AI Foundry, and Model Context Protocol (MCP).",
  },
  {
    slug: "ab-731-ai-transformation-leader",
    name: "AB-731: Microsoft AI Transformation Leader",
    urlMatchPattern: "ab-731,transformation-leader,ai-transformation-leader",
    logoUrl:
      "https://learn.microsoft.com/en-us/media/learn/certification/badges/ai-transformation-leader.svg",
    description:
      "Demonstrate technical leadership in driving organizational AI adoption, establishing responsible AI governance frameworks, aligning generative AI capabilities with business strategies, and measuring ROI across enterprise Microsoft Copilot implementations.",
  },
  {
    slug: "ab-730-ai-business-professional",
    name: "AB-730: Microsoft AI Business Professional",
    urlMatchPattern: "ab-730,business-professional",
    logoUrl:
      "https://learn.microsoft.com/en-us/media/learn/certification/badges/ai-business-professional.svg",
    description:
      "Validate foundational business expertise in leveraging Microsoft AI tools, Copilot capabilities, prompt engineering principles, and ethical AI practices to enhance productivity and business decision-making.",
  },
  {
    slug: "az-900-azure-fundamentals",
    name: "AZ-900: Microsoft Azure Fundamentals",
    urlMatchPattern: "az-900",
    logoUrl:
      "https://learn.microsoft.com/en-us/media/learn/certification/badges/microsoft-certified-fundamentals-badge.svg",
    description:
      "Demonstrate foundational knowledge of cloud concepts, Azure services, workloads, security, privacy, pricing, and support for cloud architecture.",
  },
  {
    slug: "ai-102-azure-ai-solution",
    name: "AI-102: Designing and Implementing a Microsoft Azure AI Solution",
    urlMatchPattern: "ai-102",
    logoUrl:
      "https://learn.microsoft.com/en-us/media/learn/certification/badges/microsoft-certified-associate-badge.svg",
    description:
      "Design, build, and deploy Azure AI solutions leveraging Azure Cognitive Services, Azure OpenAI, computer vision, natural language processing, and conversational AI.",
  },
];

async function main() {
  const db = getDb();

  console.log("[seed-exams] Seeding exam_types...");
  await db.insert(examTypes).values(EXAM_TYPES).onConflictDoNothing({ target: examTypes.slug });

  console.log("[seed-exams] Seeding Microsoft organization...");
  const [microsoft] = await db
    .insert(organizations)
    .values({
      name: "Microsoft",
      slug: "microsoft",
      jurisdiction: "global",
      officialUrl: "https://learn.microsoft.com",
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  const orgRow =
    microsoft ??
    (await db.query.organizations.findFirst({ where: (o, { eq }) => eq(o.slug, "microsoft") }));

  if (!orgRow) {
    throw new Error("[seed-exams] Could not create or find the Microsoft organization row.");
  }

  const certificationType = await db.query.examTypes.findFirst({
    where: (t, { eq }) => eq(t.slug, "certification"),
  });
  if (!certificationType) {
    throw new Error("[seed-exams] certification exam_type row not found after seeding.");
  }

  console.log("[seed-exams] Seeding the five Microsoft certifications...");
  for (const cert of MICROSOFT_CERTS) {
    const [examRow] = await db
      .insert(exams)
      .values({
        name: cert.name,
        slug: cert.slug,
        description: cert.description,
        organizationId: orgRow.id,
        examTypeId: certificationType.id,
        officialUrl: "https://learn.microsoft.com",
        logoUrl: cert.logoUrl,
        urlMatchPattern: cert.urlMatchPattern,
        status: "published",
      })
      .onConflictDoNothing({ target: exams.slug })
      .returning();

    const exam =
      examRow ?? (await db.query.exams.findFirst({ where: (e, { eq }) => eq(e.slug, cert.slug) }));
    if (!exam) continue;

    // Every exam variant gets at least one exam_variants row, even a degenerate "Standard" one —
    // see docs/architecture/exam-domain-model.md §12.
    const [variantRow] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .onConflictDoNothing({ target: [examVariants.examId, examVariants.slug] })
      .returning();

    const variant =
      variantRow ??
      (await db.query.examVariants.findFirst({
        where: (v, { eq, and }) => and(eq(v.examId, exam.id), eq(v.slug, "standard")),
      }));
    if (!variant) continue;

    // ...and every variant gets at least one exam_sessions row, even a degenerate single-version
    // one for exam types (like certifications) with no calendar year — see §12.
    const existingSession = await db.query.examSessions.findFirst({
      where: (s, { eq }) => eq(s.examVariantId, variant.id),
    });
    if (!existingSession) {
      await db.insert(examSessions).values({
        examVariantId: variant.id,
        label: "Version 1",
        year: null,
        status: "published",
      });
    }
  }

  console.log("[seed-exams] Done.");
}

main().catch((err) => {
  console.error("[seed-exams] Failed:", err);
  process.exit(1);
});
