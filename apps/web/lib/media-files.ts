// Serves question images from the media store the scraper writes to
// (apps/pipeline/prepora_pipeline/core/media_store.py): <MEDIA_STORAGE_DIR or <repo>/.data/media>/
// <2-char prefix>/<sha256>.<ext>. Called from apps/web/app/ssr.tsx, which is where /api/* requests
// are actually dispatched in this app (file-based API routes are never reached — see the note
// there).
//
// Local filesystem only for now. On Cloudflare there is no filesystem, so this answers 404 until
// an object-store backend (S3/R2 via the STORAGE_* variables) is added — the same boundary the
// pipeline's MediaStore interface draws.

const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$/;
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

async function mediaRoot(): Promise<string> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  if (process.env.MEDIA_STORAGE_DIR) return process.env.MEDIA_STORAGE_DIR;
  // The dev server runs from apps/web; walk up to the workspace root rather than assuming depth.
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.join(process.cwd(), ".data", "media");
    dir = parent;
  }
  return path.join(dir, ".data", "media");
}

export async function serveMediaFile(pathname: string): Promise<Response> {
  const notFound = () => new Response("Not Found", { status: 404 });
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/api\/media\//, ""));
  } catch {
    return notFound(); // a malformed %-escape is just an unknown file, not a server error
  }
  // The pattern admits only <hex>/<hex>.<ext>, so a key can never climb out of the store.
  if (!KEY_PATTERN.test(key)) return notFound();

  try {
    const path = await import("node:path");
    const { readFile } = await import("node:fs/promises");
    const body = await readFile(path.join(await mediaRoot(), key));
    const ext = key.slice(key.lastIndexOf(".") + 1);
    return new Response(body, {
      headers: {
        "Content-Type": MIME_BY_EXT[ext],
        // Content-addressed: a given key's bytes never change.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // Scraped files are served from the site's own origin; an SVG can carry script, so
        // nothing in a media response may execute even if opened directly.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return notFound();
  }
}
