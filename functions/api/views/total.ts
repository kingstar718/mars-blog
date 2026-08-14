import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { sessionFor } from "../../lib/session";

/** GET /api/views/total → 全站访问合计（登录后页脚显示，与 v2 一致） */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await sessionFor(request, env);
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(count), 0) AS n FROM page_views`
  ).first<{ n: number }>();
  return Response.json({ total: row?.n ?? 0 });
};
