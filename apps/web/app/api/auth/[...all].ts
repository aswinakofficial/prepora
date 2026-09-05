import { defineEventHandler, toWebRequest } from "vinxi/http";
import { auth, setAuth } from "../../../lib/auth";

export default defineEventHandler((event) => {
  const request = toWebRequest(event);
  
  const envSources = [
    (event?.context as any)?.cloudflare?.env,
    (event?.node?.req as any)?.cf?.env,
    (request as any)?.cf?.env,
    (globalThis as any)?.env,
    process.env,
  ];

  for (const src of envSources) {
    if (src && typeof src === "object") {
      setAuth(src);
    }
  }

  return auth.handler(request);
});
