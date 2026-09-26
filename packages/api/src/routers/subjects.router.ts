import { getDb } from "@prepora/db";
import { subjects } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import { countPublishedQuestionsByTopicForSubject } from "../lib/catalog-questions.js";

// docs/roadmap/engineering-roadmap.md item 24: subjects/$subjectSlug.tsx used to render the same
// fixed 5-topic civil-engineering list for every subject slug. This router resolves the real
// subject and its real topics, each with a real published-question count.

export const subjectsRouter = {
  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/subjects/{subjectSlug}",
      summary: "Get a subject and its topics by slug",
    })
    .input(z.object({ subjectSlug: z.string() }))
    .handler(async ({ input }) => {
      const db = getDb();
      const subject = await db.query.subjects.findFirst({
        where: eq(subjects.slug, input.subjectSlug),
        with: { topics: true },
      });

      if (!subject) {
        return {
          id: input.subjectSlug,
          name: input.subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug: input.subjectSlug,
          description: null,
          topics: [],
        };
      }

      const counts = await countPublishedQuestionsByTopicForSubject(db, subject.id);

      return {
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
        description: subject.description,
        topics: subject.topics.map((topic) => ({
          id: topic.id,
          slug: topic.slug,
          name: topic.name,
          questionCount: counts.get(topic.id) ?? 0,
        })),
      };
    }),
};
