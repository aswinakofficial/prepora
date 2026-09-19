import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
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
