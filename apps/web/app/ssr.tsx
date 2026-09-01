import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/start/server";
import { getRouterManifest } from "@tanstack/start/router-manifest";
import { router } from "./router.ts";

export default createStartHandler({
  createRouter: () => router,
  getRouterManifest,
})(defaultStreamHandler);
