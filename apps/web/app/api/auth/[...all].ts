import { defineEventHandler, toWebRequest } from "vinxi/http";
import { auth, setAuth } from "../../../lib/auth";

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  
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

  const url = new URL(request.url);
  if (url.pathname.includes("health") || url.pathname.includes("debug")) {
    const envAudit = {
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
    };
    
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString(), envAudit }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    return await auth.handler(request);
  } catch (e: any) {
    console.error("❌ [API ROUTE CRASH]", e);
    return new Response(
      JSON.stringify({ 
        error: "Auth API Crash", 
        message: e?.message || String(e), 
        stack: e?.stack 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
