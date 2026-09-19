import { createFileRoute } from "@tanstack/react-router";

export const Route = (createFileRoute("/api/llms-txt" as any) as any)({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl = process.env.VITE_PUBLIC_APP_URL || "https://prepora.xpar.in";

        // NOTE: this list must only name capabilities that actually exist.
        // A previous version advertised an /mcp endpoint and exam domains
        // (AWS, CompTIA, DP-900, AI-900, SC-900, MS-900) that were never
        // implemented — see docs/architecture/prepora-next-level-plan.md
        // finding #21. Keep this in sync with packages/api/src/index.ts and
        // the exam catalog in packages/api/src/routers/exams.router.ts.
        const body = [
          "# Prepora Platform",
          "",
          "> Prepora is an open-source exam preparation platform for previous-year exam questions, answers, and explanations.",
          "",
          "## Quick Links",
          `- Web Application: ${baseUrl}`,
          `- OpenAPI Specification: ${baseUrl}/api/openapi/spec.json`,
          "",
          "## Covered Exam Domains",
          "- Kerala PSC Assistant Engineer (Civil)",
          "- Microsoft Learn certification practice assessments (AB-100, AZ-900, AI-102)",
          "",
          "## API",
          "- oRPC endpoints (typed JSON-RPC + REST via the OpenAPI spec above) for exams, questions, and scoring.",
        ].join("\n");

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
