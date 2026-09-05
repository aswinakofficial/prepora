import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { getRouterManifest } from "@tanstack/react-start/router-manifest";
import { router } from "./router.ts";
import { auth } from "../lib/auth";
import { defineEventHandler, toWebRequest } from "vinxi/http";

const startHandler = createStartHandler({
  createRouter: () => router,
  getRouterManifest,
})(defaultStreamHandler);

import { setAuth } from "../lib/auth";

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  
  // Synchronize Cloudflare environment variables
  const envSources = [
    (event?.context as any)?.cloudflare?.env,
    (event?.node?.req as any)?.cf?.env,
    (request as any)?.cf?.env,
    (globalThis as any)?.env,
    process.env,
  ];

  for (const src of envSources) {
    if (src && typeof src === "object") {
      setAuth(src);
    }
  }

  if (request.url.includes("/api/auth")) {
    const url = new URL(request.url);
    if (url.pathname.includes("health") || url.pathname.includes("debug")) {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          envAudit: {
            NODE_ENV: process.env.NODE_ENV,
            hasClientId: !!process.env.GOOGLE_CLIENT_ID,
            hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
            hasAuthSecret: !!process.env.BETTER_AUTH_SECRET,
            hasDbUrl: !!process.env.DATABASE_URL,
            clientIdLength: (process.env.GOOGLE_CLIENT_ID || "").length,
            clientSecretLength: (process.env.GOOGLE_CLIENT_SECRET || "").length,
            authSecretLength: (process.env.BETTER_AUTH_SECRET || "").length,
            dbUrlLength: (process.env.DATABASE_URL || "").length,
            hasCloudflareContext: !!(event?.context as any)?.cloudflare,
            hasCloudflareEnv: !!(event?.context as any)?.cloudflare?.env,
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    try {
      console.log("[AUTH_DEBUG] Handling auth request:", request.url);
      console.log("[AUTH_DEBUG] GOOGLE_CLIENT_ID present:", !!process.env.GOOGLE_CLIENT_ID);
      console.log("[AUTH_DEBUG] BETTER_AUTH_SECRET present:", !!process.env.BETTER_AUTH_SECRET);
      console.log("[AUTH_DEBUG] DATABASE_URL present:", !!process.env.DATABASE_URL);
      const res = await auth.handler(request);
      console.log("[AUTH_DEBUG] Auth response status:", res.status);
      return res;
    } catch (e: any) {
      console.error("[AUTH_DEBUG] AUTH FATAL CRASH:", e.message, e.stack);
      return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  return startHandler(event);
});
