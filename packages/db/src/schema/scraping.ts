import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./shared.ts";
import { users } from "./users.ts";

export const scrapeStatusEnum = pgEnum("scrape_status", ["pending", "approved", "rejected"]);

export const scrapedQuestions = pgTable(
  "scraped_questions",
  {
    id: id(),
    sourceUrl: text("source_url").notNull(),
    rawData: text("raw_data"), // e.g. raw HTML or raw text of the question
    parsedData: jsonb("parsed_data"), // e.g. { questionText: string, options: string[], answer: string }
    status: scrapeStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("scraped_questions_status_idx").on(t.status),
    index("scraped_questions_url_idx").on(t.sourceUrl),
  ],
);

export const scrapedQuestionsRelations = relations(scrapedQuestions, ({ one }) => ({
  reviewer: one(users, { fields: [scrapedQuestions.reviewedBy], references: [users.id] }),
}));
