import { z } from "zod";
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";
import { createComment, listApproved } from "../lib/comments";
import { clientKey, hit, sweep } from "../lib/ratelimit";
import { deriveSessionSecret } from "../lib/session";

/** 十分钟内同一个 IP 最多三条 */
const LIMIT = 3;
const WINDOW_SECONDS = 10 * 60;

const inputSchema = z.object({
  slug: z
    .string()
    .regex(/^[\w-]+$/, "文章地址不合法")
    .max(200),
  author: z.string().trim().min(1, "留个称呼吧").max(24, "称呼太长了"),
  body: z.string().trim().min(2, "说点什么").max(2000, "太长了，删减一下"),
  // 蜜罐字段：不参与校验，填了就当成功静默丢弃
  website: z.string().optional(),
});

const clientIP = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "unknown";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!inputSchema.shape.slug.safeParse(slug).success) {
    return Response.json({ ok: false, message: "文章地址不合法" }, { status: 400 });
  }
  const { results } = await listApproved(env.DB, slug);
  return Response.json({ comments: results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIP(request);
  const secret = await deriveSessionSecret(env.ADMIN_PASSWORD);
  const key = await clientKey("comment", ip, secret);
  const { allowed } = await hit(env.DB, key, LIMIT, WINDOW_SECONDS);
  if (!allowed) {
    return Response.json(
      { ok: false, message: "留言太频繁了，过一会儿再来" },
      { status: 429 }
    );
  }

  const form = await request.formData();
  const parsed = inputSchema.safeParse({
    slug: form.get("slug") ?? "",
    author: form.get("author") ?? "",
    body: form.get("body") ?? "",
    website: form.get("website") ?? "",
  });
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  // 蜜罐命中：装作成功，不给脚本反馈
  if (parsed.data.website) return Response.json({ ok: true, pending: true });

  await createComment(env.DB, parsed.data.slug, parsed.data.author, parsed.data.body);
  await sweep(env.DB);
  return Response.json({ ok: true, pending: true });
};
