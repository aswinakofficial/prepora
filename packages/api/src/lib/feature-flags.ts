import { ORPCError } from "@orpc/server";
import type { getDb } from "@prepora/db";
import { featureFlags } from "@prepora/db/schema";

// Every feature flag the app knows about, with its default. The feature_flags table only stores
// admin overrides, so adding a flag is one entry here — no migration — and a fresh or wiped
// database behaves exactly like these defaults. How to add one: docs/architecture/feature-flags.md.
// A new entry automatically appears (with a toggle) on the admin Settings page and in the public
// featureFlags.list the web app reads.
export const FEATURE_FLAGS = {
  contribute: {
    label: "Contributions",
    description:
      "Public question-paper contributions: the Contribute page, its links in the header, footer " +
      "and home page, and the submission API. When off, submissions are refused and the page " +
      "says contributions are closed. Already-submitted contributions stay reviewable in admin.",
    defaultEnabled: true,
  },
} as const satisfies Record<
  string,
  { label: string; description: string; defaultEnabled: boolean }
>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

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
