# Spec 4 · M: Question images on Cloudflare R2

**Issue:** #46
**Milestone:** P · PDF stages (it's GATE's last prerequisite)
**Depends on:** nothing
**Owner actions:** yes, Cloudflare account setup (marked **[Owner]**). Claude never enters
credentials or changes Cloudflare settings without the owner's explicit go-ahead.

## Context

Question images (stem exhibits, image-only options, figures) are written by the scraper to the
**local** media store, `.data/media/<2-char>/<sha256>.<ext>`
([core/media_store.py](../../apps/pipeline/prepora_pipeline/core/media_store.py)). The web app
serves them at `/api/media/<key>` by reading that directory
([lib/media-files.ts](../../apps/web/lib/media-files.ts), dispatched from `app/ssr.tsx`). On
Cloudflare there's no filesystem, so every image would 404 on the deployed site.

No published question has an image yet (0 rows in `media` on 2026-10-02). But GATE's figures and
garbled equations are published as page crops ([Spec 5](05-gate-pilot.md)), so they'll be the first
images in production.

## Decisions

1. **A public R2 bucket on a custom domain**, `media.prepora.xpar.in`, serving objects directly.
   Pages use `https://media.prepora.xpar.in/<key>` as the image URL. No server code reads images in
   production.
   - **Why:** it's simpler and cheaper than an R2 binding behind `/api/media`, and it can be cached
     forever.
   - **SVG safety:** keys are content-addressed (sha256), so files never change. SVGs load through
     `<img>`, which never runs scripts. Opening an SVG directly runs on the media origin, not on
     `prepora.xpar.in`.
2. **The local filesystem stays the default.** With `MEDIA_PUBLIC_BASE_URL` unset, URLs remain
   `/api/media/<key>`, so local development is unchanged.
3. **Uploads happen at publish time, from the local pipeline.** When `MEDIA_STORE=r2` is set,
   `publish.py`'s `_record_media` uploads each image it records, skipping keys that already exist.
   A `media-sync` CLI command back-fills anything published before.
4. **R2 is reached through its S3-compatible API with `boto3`** (Apache-2.0), using the reserved
   `STORAGE_*` variables in `.env.example`.

## [Owner] Cloudflare setup

1. Create the R2 bucket `prepora-media` (Cloudflare dashboard → R2).
2. Connect a custom domain to it: `media.prepora.xpar.in` (bucket → Settings → Public access →
   Custom domains). The zone already belongs to this account.
3. Create an R2 API token scoped to this bucket, with **Object Read & Write**.
4. Put the token's S3 credentials in the local `.env`:
   - `STORAGE_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
   - `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`
   - `STORAGE_BUCKET=prepora-media`
   - `MEDIA_STORE=r2`
5. Set `MEDIA_PUBLIC_BASE_URL=https://media.prepora.xpar.in` in Cloudflare Pages → Settings →
   Environment variables (Production), and in the local `.env` to test.

## Changes

### Pipeline
- **[`core/media_store.py`](../../apps/pipeline/prepora_pipeline/core/media_store.py):**
  - Add `R2MediaStore(MediaStore)` built from the `STORAGE_*` variables: a `boto3.client("s3",
    endpoint_url=…, region_name="auto")`.
  - Methods:
    - `exists(key)` uses `head_object`;
    - `put(key, data, mime)` uses `put_object` with `ContentType` and
      `CacheControl="public, max-age=31536000, immutable"`;
    - `get(key)`.
  - Keys are identical to the filesystem store's.
  - Add `media_store_from_env()`, which returns `R2MediaStore` when `MEDIA_STORE=r2`, otherwise the
    filesystem store.
- **[`stages/publish.py`](../../apps/pipeline/prepora_pipeline/stages/publish.py), `_record_media`:**
  when the active store is R2, read each referenced file from the local store and upload it to R2 if
  `exists` is false, **before** inserting the media rows. If the local file is missing, raise
  `PublishError`. A published question must never point at a missing image.
- **[`cli.py`](../../apps/pipeline/prepora_pipeline/cli.py):** add `media-sync`, which uploads every
  `media.storage_key` in the database that's missing from R2 (requires `MEDIA_STORE=r2`) and prints
  a count.
- **[`requirements.txt`](../../apps/pipeline/requirements.txt):** add `boto3`.

### API and web
- **[`packages/api/src/lib/question-media.ts`](../../packages/api/src/lib/question-media.ts):**
  `mediaUrl(storageKey)` returns `${MEDIA_PUBLIC_BASE_URL}/${storageKey}` when that env var is set,
  otherwise `/api/media/${storageKey}`. Read the env var the way other server code does on Cloudflare
  (see the env-sync middleware from PR #9 and how `DATABASE_URL` is read).
- **`.env.example`:**
  - replace the "not built yet" comment;
  - document `MEDIA_STORE` and `MEDIA_PUBLIC_BASE_URL`, and note that the `STORAGE_*` variables are
    only needed for publishing images to production.

## Tests
- **Pipeline:**
  - `R2MediaStore` against a fake S3 client (monkeypatch `boto3.client`): `put` sets content type
    and cache headers; an existing key is skipped.
  - `media_store_from_env` picks the right store.
  - `_record_media` raises when a referenced local file is missing.
- **API:** `mediaUrl` with and without `MEDIA_PUBLIC_BASE_URL`.
- **No test talks to real R2.**

## Acceptance
- **Locally, with the owner's R2 settings:**
  - publishing a question with an image uploads it;
  - `https://media.prepora.xpar.in/<key>` returns the image with the immutable cache header;
  - the question page shows it.
- **With the variables unset,** local development behaves exactly as before.

## Risks
- **Credentials:** keep them in `.env` only, never in code or logs. Use a bucket-scoped token, not
  an account-wide one.
- **A missing custom domain or token isn't caught at build time.** The `media-sync` count and a
  manual check of one URL are the release gate before GATE goes live.
