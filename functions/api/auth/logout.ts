import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { sessionCookieHeaders } from "../../lib/session";

export const onRequestPost: PagesFunction<Env> = () =>
  new Response(null, {
    status: 204,
    headers: sessionCookieHeaders.clear,
  });
