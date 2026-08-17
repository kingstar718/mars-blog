import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { withSession } from "../../lib/session";

/** /api/content 全部需要登录（列、读、写都是后台动作） */
export const onRequest: PagesFunction<Env> = ({ request, env, next }) =>
  withSession(request, env, next);
