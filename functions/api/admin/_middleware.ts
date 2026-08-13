import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { sessionFor } from "../../lib/session";

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const session = await sessionFor(request, env);
  if (!session) {
    return Response.json({ ok: false, message: "未登录" }, { status: 401 });
  }
  return next();
};
