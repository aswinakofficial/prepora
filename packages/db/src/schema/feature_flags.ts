import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Admin overrides for feature flags. Which flags exist, and each one's default, are defined in
// code (packages/api/src/lib/feature-flags.ts) — a row here only records that an admin changed a
// flag from its default, and who did.
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
