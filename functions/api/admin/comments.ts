import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { setCommentStatus } from "../../lib/comments";
import { jsonError } from "../../lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as {
    id?: number;
    status?: "approved" | "spam";
  } | null;
  if (!body?.id) return jsonError("缺少 id");
  if (!body.status) return jsonError("缺少 status");
  if (body.status !== "approved" && body.status !== "spam") {
    return jsonError("status 不合法");
  }
  await setCommentStatus(env.DB, body.id, body.status);
  return Response.json({ ok: true });
};
