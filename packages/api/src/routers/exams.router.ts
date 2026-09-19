import { getDb } from "@prepora/db";
import {
  exams,
  examTypes,
  organizations,
  questionSets,
  scrapedQuestions,
  subjects,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";

// ─── Scraped-content attribution ───────────────────────────────────────────
// Replaces the deleted resolveExamMeta()/getExamDescription() — see
// docs/architecture/exam-domain-model.md and docs/roadmap/engineering-roadmap.md item 10. Neither
// function here knows about any specific exam; the actual matching data (organization, exam type,
// title, logo, description, urlMatchPattern) lives in the exams/organizations/exam_types tables,
// populated by packages/db/seed-exams.ts. A new exam is a row insert, not a code change.

type ExamWithRelations = Awaited<ReturnType<typeof loadExamsWithRelations>>[number];

async function loadExamsWithRelations(db: ReturnType<typeof getDb>) {
  return db
    .select({
      id: exams.id,
      name: exams.name,
      slug: exams.slug,
      description: exams.description,
      officialUrl: exams.officialUrl,
      logoUrl: exams.logoUrl,
      urlMatchPattern: exams.urlMatchPattern,
      status: exams.status,
      organizationName: organizations.name,
      examTypeSlug: examTypes.slug,
      examTypeLabel: examTypes.label,
    })
    .from(exams)
    .innerJoin(organizations, eq(exams.organizationId, organizations.id))
    .innerJoin(examTypes, eq(exams.examTypeId, examTypes.id));
}

// Matches a scraped question's source URL (or its declared `exam` metadata field, as a fallback)
// against every registered exam's urlMatchPattern — a comma-separated list of substrings, the same
// OR-of-substrings the deleted resolveExamMeta() used, now stored as data instead of code.
function matchExamByUrl(
  sourceUrlOrHint: string,
  examsList: ExamWithRelations[],
): ExamWithRelations | null {
  const haystack = (sourceUrlOrHint || "").toLowerCase();
  for (const exam of examsList) {
    if (!exam.urlMatchPattern) continue;
    const patterns = exam.urlMatchPattern.split(",").map((p) => p.trim());
    if (patterns.some((p) => p && haystack.includes(p))) return exam;
  }
  return null;
}

function describeExam(exam: ExamWithRelations, scrapedMetaDescription?: string): string {
  if (scrapedMetaDescription && scrapedMetaDescription.length > 20) return scrapedMetaDescription;
  return (
    exam.description || `Official practice assessment and question repository for ${exam.name}.`
  );
}

export const examsRouter = {
  // Sources apps/web/app/routes/exams/index.tsx's category filter tabs from real data instead of
  // a hand-maintained, independently-drifting frontend constant (exam-domain-model.md §2,
  // Limitation 2).
  listTypes: publicProcedure
    .route({
      method: "GET",
      path: "/exams/types",
      summary: "List exam types (categories)",
    })
    .handler(async () => {
      const db = getDb();
      return db
        .select({ slug: examTypes.slug, label: examTypes.label })
        .from(examTypes)
        .orderBy(examTypes.label);
    }),

  list: publicProcedure
    .route({
      method: "GET",
      path: "/exams",
      summary: "List all available exams/question sets",
    })
    .input(
      z
        .object({
          limit: z.number().default(100),
          category: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const registeredExams = await loadExamsWithRelations(db);

      const approvedScraped = await db
        .select()
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.status, "approved"))
        .catch(() => []);

      // Group approved scraped content by the real exam it's attributed to.
      const examMap = new Map<string, ReturnType<typeof buildScrapedExamSummary>>();

      approvedScraped.forEach((s) => {
        const pd = (s.parsedData as any) || {};
        const meta = pd.metadata || {};
        const items = pd.extractedElements || [];

        const matched = matchExamByUrl(s.sourceUrl || meta.exam || "", registeredExams);
        if (!matched) return; // unattributable scraped content is not shown as a listable exam

        if (!examMap.has(matched.slug)) {
          examMap.set(matched.slug, buildScrapedExamSummary(matched, s, meta, items));
        }
      });

      function buildScrapedExamSummary(
        exam: ExamWithRelations,
        s: (typeof approvedScraped)[number],
        meta: any,
        items: any[],
      ) {
        return {
          id: s.id,
          name: exam.name,
          title: exam.name,
          slug: exam.slug,
          organization: exam.organizationName,
          org: exam.organizationName,
          category: exam.examTypeLabel.toUpperCase(),
          categorySlug: exam.examTypeSlug,
          domain: exam.examTypeLabel.toUpperCase(),
          code: exam.slug.toUpperCase(),
          logoUrl: exam.logoUrl,
          stableContentId: exam.slug.toUpperCase(),
          count: items.length || 5,
          officialUrl: exam.officialUrl || s.sourceUrl,
          subject: meta.subject || items[0]?.subject || undefined,
          description: describeExam(exam, meta.description || meta.examDescription),
        };
      }

      const scrapedExams = Array.from(examMap.values());

      // Real catalog join via the relational query API — replaces the old hardcoded
      // "Kerala PSC / State Board" label (exam-domain-model.md §2, Limitation 3) with the actual
      // organization and exam type each question set's exam belongs to.
      const dbQuestionSetsWithCatalog = await db.query.questionSets.findMany({
        limit: input?.limit || 100,
        with: {
          examVariant: {
            with: {
              exam: { with: { organization: true, examType: true } },
            },
          },
        },
      });

      const formattedDbSets = dbQuestionSetsWithCatalog.map((qs) => {
        const exam = qs.examVariant.exam;
        return {
          id: qs.id,
          name: qs.title,
          title: qs.title,
          slug: qs.slug,
          organization: exam.organization.name,
          org: exam.organization.name,
          category: exam.examType.label.toUpperCase(),
          categorySlug: exam.examType.slug,
          domain: exam.examType.label.toUpperCase(),
          code: qs.slug.toUpperCase(),
          stableContentId: qs.slug.toUpperCase(),
          count: 100,
          officialUrl: qs.sourceUrl || exam.officialUrl || "",
          description: qs.description || "",
        };
      });

      return [...scrapedExams, ...formattedDbSets];
    }),

  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/exams/{examSlug}",
      summary: "Get exam details by slug",
    })
    .input(
      z.object({
        examSlug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const registeredExams = await loadExamsWithRelations(db);
      const targetExam = registeredExams.find((e) => e.slug === input.examSlug);

      if (targetExam) {
        const approvedScraped = await db
          .select()
          .from(scrapedQuestions)
          .where(eq(scrapedQuestions.status, "approved"))
          .catch(() => []);

        const matchingScraped = approvedScraped.filter(
          (s) => matchExamByUrl(s.sourceUrl || "", registeredExams)?.slug === targetExam.slug,
        );

        const matchedScraped = matchingScraped[0];
        const pd = ((matchedScraped?.parsedData as any) || {}) as any;
        const meta = pd.metadata || {};
        const questionsList = pd.extractedElements || [];
        const title = targetExam.name;

        // Only keep questions that carry real extracted options — a question with no options is
        // not renderable, and inventing plausible-looking options for it would be fabricating
        // content (see docs/architecture/prepora-next-level-plan.md finding #3).
        const normalizedQuestions = (questionsList || [])
          .map((q: any, i: number) => {
            let opts: { key: string; text: string }[] = [];
            if (Array.isArray(q.options) && q.options.length > 0) {
              opts = q.options.map((opt: any, oIdx: number) => {
                if (typeof opt === "string") {
                  return { key: String.fromCharCode(65 + oIdx), text: opt };
                }
                return {
                  key: opt.key || String.fromCharCode(65 + oIdx),
                  text: opt.text || opt.label || String(opt),
                };
              });
            } else if (Array.isArray(q.choices) && q.choices.length > 0) {
              opts = q.choices.map((opt: any, oIdx: number) => ({
                key: String.fromCharCode(65 + oIdx),
                text: typeof opt === "string" ? opt : opt.text || opt.label,
              }));
            }

            return {
              id: q.id || `q-${i + 1}`,
              text: q.questionText || q.text || q.question || q.prompt || "",
              options: opts,
              correctKey: q.correctKey || q.correctAnswer || q.solution || "",
              explanation: q.explanation || q.rationale || "",
              additionalReadingLinks: Array.isArray(q.additionalReadingLinks)
                ? q.additionalReadingLinks
                : [],
              additionalReading: q.additionalReading || q.additionalReadings || undefined,
              topic: q.topic || meta.subject || targetExam.name,
            };
          })
          .filter((q: any) => q.text && q.options.length >= 2 && q.correctKey);

        // If real extraction yielded nothing usable, the exam page shows an honest empty state
        // rather than fabricated sample questions.
        const finalQuestions = normalizedQuestions;
        const examDescription = describeExam(targetExam, meta.description || meta.examDescription);

        const setsList = matchingScraped.map((s, sIdx) => {
          const sPd = (s.parsedData as any) || {};
          const sQuestions = sPd.extractedElements || [];
          const setNumStr = String(sIdx + 1).padStart(2, "0");
          const setTitle =
            matchingScraped.length > 1
              ? `${title} — Question Set ${setNumStr}`
              : `${title} — Question Set 01`;

          return {
            id: s.id || `${targetExam.slug}-set-${sIdx + 1}`,
            title: setTitle,
            description: sPd.metadata?.description || "",
            questionCount: sQuestions.length || finalQuestions.length,
            tag: `${targetExam.organizationName.toUpperCase()} OFFICIAL`,
            code: `${targetExam.slug.toUpperCase()}-${setNumStr}`,
            status: "PUBLISHED",
          };
        });

        return {
          id: matchedScraped?.id || targetExam.id,
          name: title,
          slug: targetExam.slug,
          organization: targetExam.organizationName,
          category: targetExam.examTypeLabel.toUpperCase(),
          categorySlug: targetExam.examTypeSlug,
          officialUrl: matchedScraped?.sourceUrl || targetExam.officialUrl,
          logoUrl: targetExam.logoUrl || meta.logoUrl || meta.badgeUrl || null,
          description: examDescription,
          questions: finalQuestions,
          questionCount: finalQuestions.length,
          sets: setsList,
          subjects: finalQuestions.length
            ? [
                {
                  slug: (meta.subject || title).toLowerCase().replace(/\s+/g, "-"),
                  name: meta.subject || title,
                  questionCount: finalQuestions.length,
                  subtopics: 4,
                },
              ]
            : [],
          papers: [],
        };
      }

      return {
        id: input.examSlug,
        name: input.examSlug.replace(/-/g, " ").toUpperCase(),
        slug: input.examSlug,
        organization: "Official Examining Body",
        category: "EXAM",
        questions: [],
        questionCount: 0,
        subjects: [],
        papers: [],
      };
    }),

  getSubjectsByExam: publicProcedure
    .route({
      method: "GET",
      path: "/exams/{examSlug}/subjects",
      summary: "Get subjects for an exam",
    })
    .input(
      z.object({
        examSlug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const results = await db.select().from(subjects).where(eq(subjects.slug, input.examSlug));

      return results;
    }),
};
