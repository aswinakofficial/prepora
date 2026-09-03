import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../../lib/auth";

export const APIRoute = createFileRoute("/api/auth/$")({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});
