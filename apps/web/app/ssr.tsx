import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { getRouterManifest } from "@tanstack/react-start/router-manifest";
import { router } from "./router.ts";
import { auth } from "../lib/auth";
import { defineEventHandler, toWebRequest } from "vinxi/http";

const startHandler = createStartHandler({
  createRouter: () => router,
  getRouterManifest,
})(defaultStreamHandler);

export default defineEventHandler((event) => {
  const request = toWebRequest(event);
  if (request.url.includes("/api/auth")) {
    return auth.handler(request);
  }
  return startHandler(event);
});
