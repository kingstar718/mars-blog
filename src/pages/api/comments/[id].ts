import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/env";
import { getPostById } from "@/lib/db";
import { createComment, listApproved } from "@/lib/comments";

const inputSchema = z.object({
  author: z.string().trim().min(1, "留个称呼吧").max(24, "称呼太长了"),
  body: z.string().trim().min(2, "说点什么").max(2000, "太长了，删减一下"),
  // 蜜罐字段不参与校验：一旦让 zod 去拦它，返回的 400 就等于告诉脚本
  // 「这个字段不能填」，蜜罐当场失效。它只在下面被读一次，然后静默丢弃。
  website: z.string().optional(),
});

const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const GET: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  const post = id ? await getPostById(db(), id) : null;
  if (!post) return new Response("文章不存在", { status: 404 });

  const { results } = await listApproved(db(), post.id);
  return Response.json({ comments: results });
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  const post = id ? await getPostById(db(), id) : null;
  if (!post) return new Response("文章不存在", { status: 404 });

  const form = await request.formData();
  const parsed = inputSchema.safeParse({
    author: form.get("author") ?? "",
    body: form.get("body") ?? "",
    website: form.get("website") ?? "",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "输入有误";
    return Response.json({ ok: false, message }, { status: 400 });
  }

  // 蜜罐命中：装作成功，不给脚本任何反馈
  if (parsed.data.website) return Response.json({ ok: true, pending: true });

  await createComment(db(), post.id, parsed.data.author, parsed.data.body);
  return Response.json({ ok: true, pending: true });
};
