import { getDb } from "@prepora/db";
import { questionSets, scrapedQuestions, subjects } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";

function resolveExamMeta(sourceUrlOrSlug: string, scrapedMeta?: any) {
  const s = (sourceUrlOrSlug || "").toLowerCase();
  const scrapedLogo = scrapedMeta?.logoUrl || scrapedMeta?.badgeUrl;

  if (s.includes("ab-100") || s.includes("agentic-ai")) {
    return {
      title: "AB-100: Agentic AI Business Solutions Architect",
      slug: "ab-100-agentic-ai",
      code: "MS-AB100",
      examCode: "AB-100",
      logoUrl:
        scrapedLogo ||
        "https://learn.microsoft.com/en-us/media/learn/certification/badges/agentic-ai-business-solutions-architect.svg",
    };
  }
  if (
    s.includes("ab-731") ||
    s.includes("transformation-leader") ||
    s.includes("ai-transformation-leader")
  ) {
    return {
      title: "AB-731: Microsoft AI Transformation Leader",
      slug: "ab-731-ai-transformation-leader",
      code: "MS-AB731",
      examCode: "AB-731",
      logoUrl:
        scrapedLogo ||
        "https://learn.microsoft.com/en-us/media/learn/certification/badges/ai-transformation-leader.svg",
    };
  }
  if (s.includes("ab-730") || s.includes("business-professional")) {
    return {
      title: "AB-730: Microsoft AI Business Professional",
      slug: "ab-730-ai-business-professional",
      code: "MS-AB730",
      examCode: "AB-730",
      logoUrl:
        scrapedLogo ||
        "https://learn.microsoft.com/en-us/media/learn/certification/badges/ai-business-professional.svg",
    };
  }
  if (s.includes("az-900")) {
    return {
      title: "AZ-900: Microsoft Azure Fundamentals",
      slug: "az-900-azure-fundamentals",
      code: "MS-AZ900",
      examCode: "AZ-900",
      logoUrl:
        scrapedLogo ||
        "https://learn.microsoft.com/en-us/media/learn/certification/badges/microsoft-certified-fundamentals-badge.svg",
    };
  }
  if (s.includes("ai-102")) {
    return {
      title: "AI-102: Designing and Implementing a Microsoft Azure AI Solution",
      slug: "ai-102-azure-ai-solution",
      code: "MS-AI102",
      examCode: "AI-102",
      logoUrl:
        scrapedLogo ||
        "https://learn.microsoft.com/en-us/media/learn/certification/badges/microsoft-certified-associate-badge.svg",
    };
  }
  return {
    title: scrapedMeta?.name || scrapedMeta?.officialTitle || "Microsoft Practice Assessment",
    slug: "ms-learn-assessment",
    code: "MS-CERT",
    examCode: "MS-CERT",
    logoUrl: scrapedLogo || null,
  };
}

function getExamDescription(
  slug: string,
  title: string,
  metaDesc?: string,
  subject?: string,
): string {
  if (metaDesc && metaDesc.length > 20) return metaDesc;
  if (slug.includes("ab-100")) {
    return "As an AI-first solution architect, you lead the transformation of enterprise operations by envisioning and implementing AI-powered architecture, multi-agent orchestration with Copilot Studio, Azure AI Foundry, and Model Context Protocol (MCP).";
  }
  if (slug.includes("ab-731")) {
    return "Demonstrate technical leadership in driving organizational AI adoption, establishing responsible AI governance frameworks, aligning generative AI capabilities with business strategies, and measuring ROI across enterprise Microsoft Copilot implementations.";
  }
  if (slug.includes("ab-730")) {
    return "Validate foundational business expertise in leveraging Microsoft AI tools, Copilot capabilities, prompt engineering principles, and ethical AI practices to enhance productivity and business decision-making.";
  }
  if (slug.includes("az-900")) {
    return "Demonstrate foundational knowledge of cloud concepts, Azure services, workloads, security, privacy, pricing, and support for cloud architecture.";
  }
  if (slug.includes("ai-102")) {
    return "Design, build, and deploy Azure AI solutions leveraging Azure Cognitive Services, Azure OpenAI, computer vision, natural language processing, and conversational AI.";
  }
  return `Official Microsoft Learn Practice Assessment and comprehensive question repository covering ${subject || title}.`;
}

export const examsRouter = {
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
      const approvedScraped = await db
        .select()
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.status, "approved"))
        .catch(() => []);

      const dbQuestionSets = await db
        .select()
        .from(questionSets)
        .limit(input?.limit || 100)
        .catch(() => []);

      // Group approved Microsoft Learn sets by unique Exam container
      const examMap = new Map<string, any>();

      approvedScraped.forEach((s) => {
        const pd = (s.parsedData as any) || {};
        const meta = pd.metadata || {};
        const items = pd.extractedElements || [];

        const metaInfo = resolveExamMeta(s.sourceUrl || meta.exam || "", meta);
        const title = metaInfo.title;
        const slug = metaInfo.slug;
        const code = metaInfo.code;
        const subjectName = meta.subject || items[0]?.subject || "Microsoft Certification";
        const description = getExamDescription(
          slug,
          title,
          meta.description || meta.examDescription,
          subjectName,
        );

        if (!examMap.has(slug)) {
          examMap.set(slug, {
            id: s.id,
            name: title,
            title: title,
            slug: slug,
            organization: "Microsoft Learn",
            org: "Microsoft Learn",
            category: "CERTIFICATION",
            domain: "CERTIFICATION",
            code: code,
            logoUrl: metaInfo.logoUrl,
            stableContentId: code,
            count: items.length || 5,
            officialUrl: s.sourceUrl,
            subject: subjectName,
            description: description,
          });
        }
      });

      const msLearnExams = Array.from(examMap.values());

      const formattedDbSets = dbQuestionSets.map((qs) => ({
        id: qs.id,
        name: qs.title,
        title: qs.title,
        slug: qs.slug,
        organization: "Kerala PSC / State Board",
        org: "State Board",
        category: "STATE PSC",
        domain: "STATE PSC",
        code: qs.slug.toUpperCase(),
        stableContentId: qs.slug.toUpperCase(),
        count: 100,
        officialUrl: qs.sourceUrl || "",
        description: qs.description || "",
      }));

      const combined = [...msLearnExams, ...formattedDbSets];
      return combined;
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
      const approvedScraped = await db
        .select()
        .from(scrapedQuestions)
        .where(eq(scrapedQuestions.status, "approved"))
        .catch(() => []);

      const targetMeta = resolveExamMeta(input.examSlug);

      // Find matching scraped question sets for this exam
      const matchingScraped = approvedScraped.filter((s) => {
        const itemMeta = resolveExamMeta(s.sourceUrl);
        return itemMeta.slug === targetMeta.slug;
      });

      if (matchingScraped.length > 0) {
        const matchedScraped = matchingScraped[0];
        const pd = (matchedScraped.parsedData as any) || {};
        const meta = pd.metadata || {};
        const questionsList = pd.extractedElements || [];
        const title = targetMeta.title;

        // Only keep questions that carry real extracted options — a question
        // with no options is not renderable, and inventing plausible-looking
        // options for it would be fabricating content (see
        // docs/architecture/prepora-next-level-plan.md finding #3).
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
              topic: q.topic || meta.subject || "Agentic AI Architectures",
            };
          })
          .filter((q: any) => q.text && q.options.length >= 2 && q.correctKey);

        // If real extraction yielded nothing usable, the exam page shows an
        // honest empty state rather than fabricated sample questions.
        const finalQuestions = normalizedQuestions;
        const examDescription = getExamDescription(
          targetMeta.slug,
          title,
          meta.description || meta.examDescription,
          meta.subject,
        );

        const questionSets = matchingScraped.map((s, sIdx) => {
          const sPd = (s.parsedData as any) || {};
          const sQuestions = sPd.extractedElements || [];
          const setNumStr = String(sIdx + 1).padStart(2, "0");
          const setTitle =
            matchingScraped.length > 1
              ? `${title} — Question Set ${setNumStr}`
              : `${title} — Question Set 01`;

          return {
            id: s.id || `${targetMeta.slug}-set-${sIdx + 1}`,
            title: setTitle,
            description: sPd.metadata?.description || "",
            questionCount: sQuestions.length || finalQuestions.length,
            tag: "MICROSOFT LEARN OFFICIAL",
            code: `2026/MS-LEARN-${setNumStr}`,
            year: 2026,
            status: "PUBLISHED",
          };
        });

        return {
          id: matchedScraped.id,
          name: title,
          slug: targetMeta.slug,
          organization: "Microsoft Learn",
          category: "CERTIFICATION",
          officialUrl: matchedScraped.sourceUrl,
          logoUrl: targetMeta.logoUrl || meta.logoUrl || meta.badgeUrl || null,
          description: examDescription,
          questions: finalQuestions,
          questionCount: finalQuestions.length,
          sets: questionSets,
          subjects: [
            {
              slug: "agentic-ai-architecture",
              name: meta.subject || "Microsoft Agentic AI Architectures",
              questionCount: finalQuestions.length,
              subtopics: 4,
            },
          ],
          papers: [
            {
              year: 2026,
              title: `${title} - Official Practice Assessment`,
              questions: finalQuestions.length,
              code: "2026/MS-LEARN",
            },
          ],
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
