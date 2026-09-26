import { ORPCError } from "@orpc/server";
import { getDb } from "@prepora/db";
import { contributions } from "@prepora/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import { requireFeature } from "../lib/feature-flags.js";
import { adminProcedure } from "./admin.router.js";

// docs/roadmap/engineering-roadmap.md item 24: admin/contributions.tsx and contribute.tsx both
// operated on entirely local, unpersisted state (mockSubmissions / setSubmitted(true) with no
// network call) — nothing ever reached the database, and contribute.tsx's success message was
// false. This router backs both pages with the real, already-defined but previously unused
// `contributions` table (packages/db/src/schema/users.ts).

export const contributionsRouter = {
  submit: publicProcedure
    .route({
      method: "POST",
      path: "/contributions",
      summary: "Submit a community contribution",
    })
    .input(
      z.object({
        examSlug: z.string().optional(),
        examVariantSlug: z.string().optional(),
        year: z.number().optional(),
        subjectSlug: z.string().optional(),
        title: z.string().optional(),
        markdownContent: z.string().min(1, "Markdown content is required"),
        contributorName: z.string().optional(),
        contributorEmail: z.string().email().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      // Enforced here, not just by hiding the page's links: with the flag off, a direct POST to
      // this endpoint must be refused too.
      await requireFeature(db, "contribute", "Contributions are currently closed.");
      const [row] = await db
        .insert(contributions)
        .values({
          examSlug: input.examSlug,
          examVariantSlug: input.examVariantSlug,
          year: input.year,
          subjectSlug: input.subjectSlug,
          title: input.title,
          markdownContent: input.markdownContent,
          contributorName: input.contributorName,
          contributorEmail: input.contributorEmail,
          status: "pending",
        })
        .returning({ id: contributions.id });
      return { id: row.id, status: "pending" as const };
    }),

  list: adminProcedure
    .route({
      method: "GET",
      path: "/admin/contributions",
      summary: "List community contributions",
    })
    .input(
      z
        .object({
          status: z
            .enum(["pending", "processing", "approved", "rejected", "needs_correction"])
            .optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      return db.query.contributions.findMany({
        where: input?.status ? eq(contributions.status, input.status) : undefined,
        orderBy: desc(contributions.createdAt),
      });
    }),

  updateStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/contributions/{id}/status",
      summary: "Update a contribution's review status",
    })
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["pending", "processing", "approved", "rejected", "needs_correction"]),
        reviewNote: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: contributions.id })
        .from(contributions)
        .where(eq(contributions.id, input.id));
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Contribution not found" });

      await db
        .update(contributions)
        .set({
          status: input.status,
          reviewNote: input.reviewNote,
          reviewedBy: context.user.id,
        })
        .where(eq(contributions.id, input.id));

      return { id: input.id, status: input.status };
    }),
};
