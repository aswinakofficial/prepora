import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@prepora/api";
import { getDb, sql } from "@prepora/db";
import { getRouterManifest } from "@tanstack/react-start/router-manifest";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { defineEventHandler, toWebRequest } from "vinxi/http";
import { getAuth } from "../lib/auth";
import { serveMediaFile } from "../lib/media-files";
import { syncRuntimeEnv } from "../lib/runtime-env";
import { createRouter } from "./router.ts";

// createRouter must be called fresh per request — see the note on the
// createRouter factory itself in router.ts for why.
const startHandler = createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler);

const rpcHandler = new RPCHandler(appRouter);

// IMPORTANT — read before "simplifying" this file:
//
// This inline interception for /api/orpc, /api/health, and /api/auth
// looks redundant with dedicated file routes (routes/api/orpc.$.ts,
// routes/api/auth.$.ts, and formerly routes/api/health.ts), and an
// earlier version of this project's architecture audit (finding #18)
// assumed it was safe to delete in favor of those routes. That assumption
// was tested directly — against both `vinxi dev` and the live production
// deployment — and does not hold: with this interception removed,
// /api/orpc/*, /api/auth/*, and other file-based API routes
// (createFileRoute(...).server.handlers *and* createAPIFileRoute) all
// 404 in this project's current configuration, in both places. Google
// sign-in and the admin panel — which depend on /api/auth — are confirmed
// working in production specifically because this interception exists.
// Do not remove it without first confirming file-route dispatch actually
// works end to end against a real deployment.
//
// Separately (discovered while verifying the above, not yet root-caused):
// a hand-built POST to /api/orpc/<procedure> also returns a 404 HTML page
// in production, including for exams.list — a public procedure the
// homepage itself calls. Whether the app's real oRPC client (a different
// request shape than a manually constructed one) is unaffected by
// whatever causes that, or this is a live defect, is unconfirmed. That
// needs dedicated investigation; it is out of scope for what this file
// changes here.
export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);

  // Cloudflare passes environment bindings per request; copy them into process.env before anything
  // below reads it. Server functions get the same from app/global-middleware.ts.
  syncRuntimeEnv(event, request);

  if (request.url.includes("/api/orpc")) {
    try {
      const { response } = await rpcHandler.handle(request, {
        prefix: "/api/orpc",
        context: {
          reqHeaders: request.headers,
        },
      });
      return response || new Response("Not Found", { status: 404 });
    } catch (err: any) {
      console.error("[ORPC] Unhandled exception:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  // Question images — see lib/media-files.ts. Matched on the path prefix (not `includes`, like
  // the handlers above) so no other URL can reach the file reader.
  const { pathname: requestPath } = new URL(request.url);
  if (request.method === "GET" && requestPath.startsWith("/api/media/")) {
    return serveMediaFile(requestPath);
  }

  // A liveness check: is the process up, and can it reach the database?
  // This used to be a separate file route (routes/api/health.ts) that,
  // like every other createFileRoute(...).server.handlers route in this
  // app, is unreachable in the current configuration — see the note
  // above. It also returned secret presence *and length* for four
  // environment variables on every request; see
  // docs/architecture/prepora-next-level-plan.md finding #19.
  if (request.url.includes("/api/health")) {
    let database: "connected" | "unreachable" = "unreachable";
    try {
      await getDb().execute(sql`select 1`);
      database = "connected";
    } catch {
      database = "unreachable";
    }
    return new Response(
      JSON.stringify({
        status: database === "connected" ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        database,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (request.url.includes("/api/auth")) {
    const pathname = new URL(request.url).pathname;
    try {
      const response = await getAuth().handler(request);

      if (!response.ok) {
        // Log the failure server-side for operators; the response body
        // sent to the client is whatever Better Auth itself returned —
        // no environment/secret diagnostics are attached to it (a prior
        // version did this for any URL containing "health" or "debug",
        // see finding #19).
        const details = await response
          .clone()
          .text()
          .catch(() => "");
        console.error(
          `[AUTH] ${response.status} on ${pathname}${details ? `: ${details.slice(0, 500)}` : ""}`,
        );
      }

      return response;
    } catch (err: any) {
      console.error(`[AUTH] Unhandled exception on ${pathname}:`, err);
      return new Response(
        JSON.stringify({
          error: { message: "Authentication service error.", code: "AUTH_SERVER_EXCEPTION" },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return startHandler(event);
});
