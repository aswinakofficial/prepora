import { OpenAPIGenerator } from "@orpc/openapi";
import { appRouter } from "@prepora/api";
import { createFileRoute } from "@tanstack/react-router";

const generator = new OpenAPIGenerator();

export const Route = (createFileRoute("/api/openapi/spec.json" as any) as any)({
  server: {
    handlers: {
      GET: async () => {
        const spec = await generator.generate(appRouter, {
          info: {
            title: "Prepora Internal & External API",
            version: "1.0.0",
            description:
              "The oRPC powered API definition for Prepora platform apps, scrappers, and agents.",
          },
        });
        return new Response(JSON.stringify(spec), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
