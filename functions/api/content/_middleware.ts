import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { sessionFor } from "../../lib/session";

/** /api/content 全部需要登录（列、读、写都是后台动作） */
export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const session = await sessionFor(request, env);
  if (!session) {
    return Response.json({ ok: false, message: "未登录" }, { status: 401 });
  }
  return next();
};
