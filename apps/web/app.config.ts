import { defineConfig } from "@tanstack/react-start/config";
import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
  },
  vite: {
    plugins: [
      tailwindcss(),
      lingui(),
    ],
    envDir: "../../",
  },
  react: {
    babel: {
      plugins: ["macros"],
    },
  },
});
