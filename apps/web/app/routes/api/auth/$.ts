import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "../../../../lib/auth";

export const APIRoute = createAPIFileRoute("/api/auth/$")({
  GET: ({ request }: { request: Request }) => auth.handler(request),
  POST: ({ request }: { request: Request }) => auth.handler(request),
});


