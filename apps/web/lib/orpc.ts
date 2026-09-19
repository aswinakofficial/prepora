import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter } from "@prepora/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const getRpcUrl = () => {
  if (typeof window === "undefined") {
    const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
    return `${baseUrl.replace(/\/$/, "")}/api/orpc`;
  }
  return `${window.location.origin}/api/orpc`;
};

export const orpcClient: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({
    url: getRpcUrl(),
    fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
    headers: () => ({}),
  })
);

export const orpc = createTanstackQueryUtils(orpcClient);
