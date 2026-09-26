import { getDb } from "@prepora/db";
import { publicProcedure } from "../context.js";
import { getFeatureFlagStates } from "../lib/feature-flags.js";

// Public, read-only: the web app needs each flag's on/off state to decide what to show (e.g.
// whether to render Contribute links). Changing a flag is admin-only — admin.setFeatureFlag.
export const featureFlagsRouter = {
  list: publicProcedure
    .route({
      method: "GET",
      path: "/feature-flags",
      summary: "Current state of every feature flag",
    })
    .handler(async () => getFeatureFlagStates(getDb())),
};
