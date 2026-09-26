import { FEATURE_FLAGS, type FeatureFlagKey } from "@prepora/api";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../lib/orpc";

// Whether a feature flag (packages/api/src/lib/feature-flags.ts) is on. `enabled` stays false
// until the flags have loaded, so a feature an admin has switched off never flashes onto the page
// first; one shared query serves every caller on the page. If the flags can't be fetched at all,
// each flag falls back to its registered default rather than reading as "off" (the server still
// enforces the real state). For hiding a piece of UI, prefer
// <FeatureGate>; for a whole page, <FeatureUnavailable> (components/feature/FeatureGate.tsx).
export function useFeatureFlag(key: FeatureFlagKey): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading, isError } = useQuery({
    ...orpc.featureFlags.list.queryOptions(),
    staleTime: 60_000,
  });
  const fallback = isError ? FEATURE_FLAGS[key].defaultEnabled : false;
  return { enabled: data?.[key] ?? fallback, isLoading };
}
