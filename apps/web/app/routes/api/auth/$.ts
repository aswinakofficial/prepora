import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "../../../../lib/auth";

const handleAuth = async (request: Request) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("❌ [AUTH ERROR] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment variables!", {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasAuthSecret: !!process.env.BETTER_AUTH_SECRET,
      });
    }
    return await auth.handler(request);
  } catch (err: any) {
    console.error("❌ [AUTH HANDLER ERROR]:", err);
    return new Response(
      JSON.stringify({
        error: {
          message: err?.message || "Internal server authentication error.",
          code: "AUTH_SERVER_ERROR",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const APIRoute = createAPIFileRoute("/api/auth/$")({
  GET: ({ request }: { request: Request }) => handleAuth(request),
  POST: ({ request }: { request: Request }) => handleAuth(request),
});



