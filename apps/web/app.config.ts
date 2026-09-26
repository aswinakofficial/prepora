import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
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
