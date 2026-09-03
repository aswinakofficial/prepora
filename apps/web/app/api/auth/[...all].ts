import { defineEventHandler, toWebRequest } from "vinxi/http";
import { auth } from "../../../lib/auth";

export default defineEventHandler((event) => {
  const request = toWebRequest(event);
  return auth.handler(request);
});
