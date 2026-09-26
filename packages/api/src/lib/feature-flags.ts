import { ORPCError } from "@orpc/server";
import type { getDb } from "@prepora/db";
import { featureFlags } from "@prepora/db/schema";

// The registry itself lives in ../shared.ts (no server imports) so the web app's client bundle can
// read the defaults too; this module adds the database-backed state on top.
import { FEATURE_FLAG_KEYS, FEATURE_FLAGS, type FeatureFlagKey } from "../shared.js";

export { FEATURE_FLAG_KEYS, FEATURE_FLAGS, type FeatureFlagKey };

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return key in FEATURE_FLAGS;
}

/** Every flag's current state: the admin's override if there is one, else its default. */
export async function getFeatureFlagStates(
  db: ReturnType<typeof getDb>,
): Promise<Record<FeatureFlagKey, boolean>> {
  const overrides = await db
    .select({ key: featureFlags.key, enabled: featureFlags.enabled })
    .from(featureFlags);
  const byKey = new Map(overrides.map((row) => [row.key, row.enabled]));
  return Object.fromEntries(
    FEATURE_FLAG_KEYS.map((key) => [key, byKey.get(key) ?? FEATURE_FLAGS[key].defaultEnabled]),
  ) as Record<FeatureFlagKey, boolean>;
}

export async function isFeatureEnabled(
  db: ReturnType<typeof getDb>,
  key: FeatureFlagKey,
): Promise<boolean> {
  return (await getFeatureFlagStates(db))[key];
}

/**
 * Server-side gate for any procedure behind a flag: throws FORBIDDEN while the flag is off. Use it
 * in every procedure that belongs to a gated feature — hiding the feature's UI alone doesn't stop
 * a direct API call.
 */
export async function requireFeature(
  db: ReturnType<typeof getDb>,
  key: FeatureFlagKey,
  message = `${FEATURE_FLAGS[key].label} is currently turned off.`,
): Promise<void> {
  if (!(await isFeatureEnabled(db, key))) {
    throw new ORPCError("FORBIDDEN", { message });
  }
}
