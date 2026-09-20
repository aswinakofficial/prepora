import { getDb } from "@prepora/db";
import { questionSets } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import {
  listPublishedOccurrencesForQuestionSet,
  loadQuestionsWithAnswers,
} from "../lib/catalog-questions.js";

// docs/roadmap/engineering-roadmap.md item 24: question-sets/$slug.tsx used to render a fixed
// 5-question fixture and hardcoded every question link's examSlug/variantSlug/year/subjectSlug to
// "kerala-psc-ae-civil"/"paper-1"/"2025"/"strength-of-materials" regardless of the actual set —
// meaning every question-set page linked to the same wrong question URLs. This router resolves the
// real set and real per-question link params from the occurrence each question actually belongs to.

export const questionSetsRouter = {
  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/question-sets/{slug}",
      summary: "Get a question set and its published questions by slug",
    })
    .input(z.object({ slug: z.string() }))
    .handler(async ({ input }) => {
      const db = getDb();
      const set = await db.query.questionSets.findFirst({
        where: eq(questionSets.slug, input.slug),
      });

      if (!set) {
        return {
          id: input.slug,
          title: input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug: input.slug,
          description: null,
          questions: [],
        };
      }

      const occurrences = await listPublishedOccurrencesForQuestionSet(db, set.id);
      const questionsById = await loadQuestionsWithAnswers(
        db,
        occurrences.map((o) => o.questionId),
      );

      const questionsList = occurrences
        .map((occ, idx) => {
          const q = questionsById.get(occ.questionId);
          if (!q) return null;
          return {
            number: occ.originalQuestionNumber ?? idx + 1,
            text: q.questionText,
            slug: q.slug,
            topic: q.topicName || occ.subjectName || "General",
            difficulty: q.difficulty,
            examSlug: occ.examSlug,
            variantSlug: occ.examVariantSlug,
            year: occ.year,
            subjectSlug: occ.subjectSlug,
          };
        })
        .filter((q): q is NonNullable<typeof q> => q !== null);

      return {
        id: set.id,
        title: set.title,
        slug: set.slug,
        description: set.description,
        questions: questionsList,
      };
    }),
};
