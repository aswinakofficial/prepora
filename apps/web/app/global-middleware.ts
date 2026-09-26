import { createMiddleware, registerGlobalMiddleware } from "@tanstack/react-start";
import { getEvent } from "@tanstack/react-start/server";
import { syncRuntimeEnv } from "../lib/runtime-env";

// Runs before every server function (createServerFn). Server functions are served from /_server by
// their own handler, not app/ssr.tsx, so without this they don't see Cloudflare's per-request
// environment bindings — see lib/runtime-env.ts.
const runtimeEnvMiddleware = createMiddleware().server(async ({ next }) => {
  syncRuntimeEnv(getEvent());
  return next();
});

registerGlobalMiddleware({
  middleware: [runtimeEnvMiddleware],
});
