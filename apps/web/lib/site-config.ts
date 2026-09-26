// docs/roadmap/engineering-roadmap.md item 26: three different production domains were scattered
// across the repo (prepora.in in robots.txt/sitemap/rss generators, prepora.xpar.in in
// packages/auth/src/index.ts and llms-txt.ts, prepora-9g4.pages.dev also in auth trustedOrigins)
// with nothing establishing which was real. prepora.xpar.in is the confirmed canonical production
// domain — every canonical tag, JSON-LD absolute URL, and generated sitemap/RSS entry must use
// this constant so they agree regardless of which host actually served the request (a Cloudflare
// Pages preview URL should still claim prepora.xpar.in as canonical, not itself).
export const CANONICAL_ORIGIN = "https://prepora.xpar.in";
