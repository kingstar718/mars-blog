import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { listPending, setCommentStatus } from "@/lib/comments";

export const GET: APIRoute = async () => {
  const { results } = await listPending(db());
  return Response.json({ comments: results });
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as {
    id?: number;
    status?: "approved" | "spam";
  };
  if (!body.id || !body.status) {
    return new Response("缺少 id 或 status", { status: 400 });
  }
  await setCommentStatus(db(), body.id, body.status);
  return Response.json({ ok: true });
};
