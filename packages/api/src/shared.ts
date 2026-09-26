// Constants the web app's *client* code needs from the API package. This module must stay free of
// server imports (oRPC server, database, auth): the package entry point (index.ts) pulls in every
// router, and importing a value from it in browser code drags server-only modules into the client
// bundle, which fails the production build. Client code imports from "@prepora/api/src/shared";
// the entry point re-exports all of this for server-side callers.

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

// Typed confirmation required before wipeDatabase executes — see docs/roadmap/engineering-roadmap.md
// item 6. Exported so the frontend prompts for exactly this string rather than hardcoding a second
// copy that could drift from what the server actually checks.
export const WIPE_DATABASE_CONFIRMATION_PHRASE = "WIPE DATABASE";

// The only tables wipeDatabase leaves intact — see the handler for why each one is kept. Exported
// so the settings page lists exactly what the server keeps.
export const WIPE_DATABASE_KEEP_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verifications",
  "exam_types",
  "sources",
  "feature_flags",
];
