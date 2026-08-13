import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { setCommentStatus } from "../../lib/comments";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as {
    id?: number;
    status?: "approved" | "spam";
  } | null;
  if (!body?.id || !body.status) {
    return Response.json({ ok: false, message: "缺少 id 或 status" }, { status: 400 });
  }
  await setCommentStatus(env.DB, body.id, body.status);
  return Response.json({ ok: true });
};
