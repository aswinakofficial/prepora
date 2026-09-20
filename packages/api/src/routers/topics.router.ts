import { getDb } from "@prepora/db";
import { topics } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import {
  listPublishedOccurrencesForTopic,
  loadQuestionsWithAnswers,
} from "../lib/catalog-questions.js";

// docs/roadmap/engineering-roadmap.md item 24: topics/$topicSlug.tsx used to render a fixed
// 8-question Strength-of-Materials fixture regardless of the actual topicSlug in the URL. This
// router resolves a real topic and its real published questions instead.
//
// Note: topics.slug is unique per-subject (unique on (subjectId, slug)), not globally, so a slug
// collision across two different subjects is possible in principle. The route today only carries
// topicSlug (no subjectSlug segment), so this returns the first match — same pragmatic choice the
// question-detail lookup makes for questions.slug. Revisiting the URL shape is out of scope here.

export const topicsRouter = {
  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/topics/{topicSlug}",
      summary: "Get a topic and its published questions by slug",
    })
    .input(z.object({ topicSlug: z.string() }))
    .handler(async ({ input }) => {
      const db = getDb();
      const topic = await db.query.topics.findFirst({
        where: eq(topics.slug, input.topicSlug),
        with: { subject: true },
      });

      if (!topic) {
        return {
          id: input.topicSlug,
          name: input.topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug: input.topicSlug,
          description: null,
          subjectSlug: null,
          subjectName: null,
          questions: [],
        };
      }

      const occurrences = await listPublishedOccurrencesForTopic(db, topic.id);
      const questionsById = await loadQuestionsWithAnswers(
        db,
        occurrences.map((o) => o.questionId),
      );

      const questionsList = occurrences
        .map((occ) => {
          const q = questionsById.get(occ.questionId);
          if (!q) return null;
          return {
            id: q.id,
            text: q.questionText,
            explanation: q.explanation,
            difficulty: q.difficulty,
            examSlug: occ.examSlug,
            variantSlug: occ.examVariantSlug,
            year: occ.year,
            subjectSlug: occ.subjectSlug || topic.subject.slug,
            questionSlug: q.slug,
          };
        })
        .filter((q): q is NonNullable<typeof q> => q !== null);

      return {
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        description: topic.description,
        subjectSlug: topic.subject.slug,
        subjectName: topic.subject.name,
        questions: questionsList,
      };
    }),
};
