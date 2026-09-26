import { getDb } from "@prepora/db";
import { featureFlags } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAGS,
  getFeatureFlagStates,
  isFeatureEnabled,
  isFeatureFlagKey,
} from "./feature-flags.js";
import { getStaticSitemapUrls } from "./sitemap.js";

describe("feature flag registry", () => {
  it("knows its flags and nothing else", () => {
    expect(isFeatureFlagKey("contribute")).toBe(true);
    expect(isFeatureFlagKey("not-a-flag")).toBe(false);
  });

  it("keeps Contribute on by default, so nothing changes until an admin turns it off", () => {
    expect(FEATURE_FLAGS.contribute.defaultEnabled).toBe(true);
  });
});

describe("sitemap and the contribute flag", () => {
  const has = (urls: { loc: string }[]) => urls.some((u) => u.loc.endsWith("/contribute"));
  it("lists /contribute only while contributions are on", () => {
    expect(has(getStaticSitemapUrls("https://x.test"))).toBe(true);
    expect(has(getStaticSitemapUrls("https://x.test", { contributeEnabled: true }))).toBe(true);
    expect(has(getStaticSitemapUrls("https://x.test", { contributeEnabled: false }))).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("feature flag overrides (database)", () => {
  it("an admin override wins over the default, and removing it restores the default", async () => {
    const db = getDb();
    const [original] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, "contribute"));
    try {
      const flipped = !FEATURE_FLAGS.contribute.defaultEnabled;
      await db
        .insert(featureFlags)
        .values({ key: "contribute", enabled: flipped })
        .onConflictDoUpdate({ target: featureFlags.key, set: { enabled: flipped } });
      expect(await isFeatureEnabled(db, "contribute")).toBe(flipped);

      await db.delete(featureFlags).where(eq(featureFlags.key, "contribute"));
      expect((await getFeatureFlagStates(db)).contribute).toBe(
        FEATURE_FLAGS.contribute.defaultEnabled,
      );
    } finally {
      // Leave the admin's real setting exactly as it was.
      await db.delete(featureFlags).where(eq(featureFlags.key, "contribute"));
      if (original) await db.insert(featureFlags).values(original);
    }
  });
});
