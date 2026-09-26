/// <reference types="vinxi/types/client" />
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

// This must be a factory, not a pre-built singleton. createStartHandler
// (in ssr.tsx) calls this once per incoming request to get an isolated
// router instance for that request; each router carries its own
// `state.statusCode`, which defaultRenderHandler uses as the response's
// HTTP status. A shared singleton router means that state — including
// statusCode — persists across requests within the same process/Worker
// isolate: once any request hits an unmatched route and the router sets
// state.statusCode to 404, every subsequent request sharing that same
// router instance inherits the stale 404 status even though it renders
// completely correct content. Confirmed by reproducing it directly: one
// request to an unmatched route permanently broke every following
// request in the same `wrangler pages dev` (real Worker runtime)
// instance until restarted. See the corresponding note in
// docs/architecture/prepora-next-level-plan.md.
export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultSsr: true,
    scrollRestoration: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
