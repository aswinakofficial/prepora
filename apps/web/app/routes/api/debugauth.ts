import { createFileRoute } from "@tanstack/react-router";

export const Route = (createFileRoute("/api/debugauth" as any) as any)({
  server: {
    handlers: {
      GET: async () => {
        const processEnv = process.env.ADMIN_USERS;
        const globalThisEnv = (globalThis as any)?.ADMIN_USERS;
        
        let metaEnv = "undefined";
        try {
            metaEnv = import.meta.env?.ADMIN_USERS || "Not found";
        } catch(e) {}

        return new Response(JSON.stringify({ 
            processEnv,
            globalThisEnv,
            metaEnv
        }), { status: 200, headers: { "Content-Type": "application/json"} });
      }
    }
  }
});
