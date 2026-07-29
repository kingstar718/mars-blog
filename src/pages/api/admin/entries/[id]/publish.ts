import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { getEntry, publishEntry, unpublishEntry } from "@/lib/entries";
import { purge } from "@/lib/cache";

const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * 发布。完整的 zod 校验在这里跑——对应旧站构建期校验 frontmatter 的位置。
 * 校验不过返回 400 和逐字段的错误，编辑器直接摊在对应输入框下面。
 */
export const POST: APIRoute = async ({ params, url }) => {
  const id = parseId(params.id);
  if (!id) return new Response("id 无效", { status: 400 });

  const row = await getEntry(db(), id);
  if (!row) return new Response("内容不存在", { status: 404 });

  const result = await publishEntry(db(), row);
  if (result.ok) await purge(url.origin, id);

  return Response.json(result, { status: result.ok ? 200 : 400 });
};

/** 撤回：转回草稿，不删内容 */
export const DELETE: APIRoute = async ({ params, url }) => {
  const id = parseId(params.id);
  if (!id) return new Response("id 无效", { status: 400 });

  await unpublishEntry(db(), id);
  await purge(url.origin, id);
  return Response.json({ ok: true });
};
