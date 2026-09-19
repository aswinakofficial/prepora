import { createAPIFileRoute } from "@tanstack/react-start/api";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@prepora/api";

const handleORPC = new RPCHandler(appRouter);

const processRequest = async (request: Request) => {
  const cookieHeader = request.headers.get("cookie");
  console.log(`[ORPC API] Handling request: ${request.method} ${request.url} (Cookie present: ${Boolean(cookieHeader)})`);
  try {
    const result = await handleORPC.handle(request, {
      prefix: "/api/orpc",
      context: {
        reqHeaders: request.headers,
      }
    });
    console.log(`[ORPC API] Resolved matched=${result.matched}, status=${result.response?.status}`);
    return result.response || new Response("Not Found", { status: 404 });
  } catch (error) {
    console.error(`[ORPC API] Unhandled exception:`, error);
    return new Response(String(error), { status: 500 });
  }
};

export const APIRoute = createAPIFileRoute("/api/orpc/$")({
  GET: ({ request }) => processRequest(request),
  POST: ({ request }) => processRequest(request),
  PUT: ({ request }) => processRequest(request),
  DELETE: ({ request }) => processRequest(request),
  PATCH: ({ request }) => processRequest(request),
});
