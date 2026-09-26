import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
    // Use Cloudflare's native Node.js compatibility instead of polyfills. Server functions and
    // TanStack Start's request helpers (getEvent, getWebRequest) need a working AsyncLocalStorage;
    // the polyfill Nitro bundles without this is a no-op, so on Cloudflare every server function
    // failed with "Context is not available" (the /admin guard and the header's admin check).
    // REQUIRES the `nodejs_compat` compatibility flag on the Cloudflare Pages project (Settings →
    // Runtime → Compatibility flags, for Production and Preview) — without it the worker won't start.
    cloudflare: {
      nodeCompat: true,
    },
    // The production (Workers) bundle only ever talks to Neon, and node-postgres — used for local
    // databases, see packages/db/src/client.ts — can't be bundled for Workers. This only affects the
    // Nitro server build; `pnpm dev` resolves the real package.
    alias: {
      pg: fileURLToPath(new URL("./lib/pg-unavailable.ts", import.meta.url)),
    },
  },
  vite: {
    plugins: [tailwindcss(), lingui()],
    envDir: "../../",
  },
  react: {
    babel: {
      plugins: ["macros"],
    },
  },
});
