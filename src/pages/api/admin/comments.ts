import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { purge } from "@/lib/cache";
import { listPending, setCommentStatus } from "@/lib/comments";

export const GET: APIRoute = async () => {
  const { results } = await listPending(db());
  return Response.json({ comments: results });
};

export const POST: APIRoute = async ({ request, url }) => {
  const body = (await request.json()) as {
    id?: number;
    status?: "approved" | "spam";
  };
  if (!body.id || !body.status) {
    return new Response("缺少 id 或 status", { status: 400 });
  }
  await setCommentStatus(db(), body.id, body.status);
  // 通过的评论要立刻出现在文章页上，缓存里那份是没有它的
  await purge(url.origin);
  return Response.json({ ok: true });
};
