import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { getWebRequest } from "@tanstack/start/server";
import { auth } from "../../lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getWebRequest();
  if (!request) return null;
  
  return auth.api.getSession({
    headers: request.headers,
  });
});

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({
        to: "/auth/signin",
      });
    }
    return { session };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = Route.useRouteContext();
  
  return (
    <div className="flex min-h-[80vh] flex-col p-8">
      <div className="space-y-4">
        <h1 className="font-mono text-xl tracking-tighter text-white uppercase flex items-center gap-3 border-b-[0.5px] border-white/10 pb-4">
          <span className="text-white/30 text-base">»</span> User Configuration
        </h1>
        <p className="font-mono text-xs text-white/50 w-full max-w-lg mb-8 uppercase tracking-widest">
          Authenticated Node Profile
        </p>

        <pre className="font-mono text-[10px] text-white/60 bg-white/[0.02] p-4 border-[0.5px] border-white/10 overflow-x-auto w-full max-w-2xl">
          {JSON.stringify(session.user, null, 2)}
        </pre>
      </div>
    </div>
  );
}
