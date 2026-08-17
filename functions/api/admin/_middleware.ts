import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { withSession } from "../../lib/session";

export const onRequest: PagesFunction<Env> = ({ request, env, next }) =>
  withSession(request, env, next);
