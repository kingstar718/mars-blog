import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { sessionFor } from "../../lib/session";

/** 会话检测：前端据此决定是否显示编辑入口 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await sessionFor(request, env);
  if (!session) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true });
};
