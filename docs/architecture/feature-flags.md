# Feature flags

Admins can switch whole features on and off from **Admin → Settings → Feature Flags**, without a
deploy. The first flag is `contribute` (public question-paper contributions).

## How it works

- **The registry is code.** `packages/api/src/shared.ts` defines every flag: its key,
  label, description and `defaultEnabled`.
- **The database stores only overrides.** The `feature_flags` table holds a row only for a flag an
  admin has changed from its default, plus who changed it and when. A fresh or wiped database
  therefore behaves exactly like the defaults. A database wipe keeps this table
  (`WIPE_DATABASE_KEEP_TABLES`), since it's configuration rather than content.
- **Reads are public, writes are admin-only.**
  - `featureFlags.list` returns `{ flagKey: boolean }` for the web app.
  - `admin.listFeatureFlags` and `admin.setFeatureFlag` power the Settings page.
  - Every change is written to the audit log.

## Adding a flag for a new feature

1. **Register it.** Add an entry to `FEATURE_FLAGS` in `packages/api/src/shared.ts`:

   ```ts
   myFeature: {
     label: "My feature",
     description: "What turning this off hides and blocks.",
     defaultEnabled: false, // usually off until the feature is ready
   },
   ```

   You don't need a migration, and you don't need to touch the admin UI: the flag shows up on the
   Settings page with its own toggle.

2. **Gate the server.** Call `requireFeature` at the top of every procedure that belongs to the
   feature. This matters: hiding the UI alone doesn't stop a direct API call.

   ```ts
   await requireFeature(db, "myFeature"); // throws FORBIDDEN while the flag is off
   ```

   For anything else that should respect the flag (a sitemap entry, a background job), use
   `isFeatureEnabled(db, "myFeature")`.

3. **Gate the UI** in `apps/web`:
   - Links, buttons and sections: `<FeatureGate flag="myFeature">…</FeatureGate>`, from
     `components/feature/FeatureGate.tsx`.
   - The feature's own page, for anyone arriving by URL: render `<FeatureUnavailable title="…" />`
     when `useFeatureFlag("myFeature").enabled` is false.
   - Anything else: use the `useFeatureFlag("myFeature")` hook.

   Flag names are typed (`FeatureFlagKey`), so a misspelt flag fails the typecheck. While flags are
   loading, `enabled` is `false`, so a switched-off feature never flashes onto the page. If the
   flags request fails outright, each flag falls back to its registered `defaultEnabled`; the
   server-side `requireFeature` check still enforces the real state.

## Removing a flag

When a feature is permanently on (or removed), delete its registry entry and every
`requireFeature` / `FeatureGate` / `useFeatureFlag` use of it. The typecheck finds any use you
miss. Any leftover override row is simply ignored.
