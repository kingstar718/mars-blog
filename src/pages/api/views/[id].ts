import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { bumpViews } from "@/lib/db";

/**
 * 浏览量自增。
 *
 * 由页面上的脚本调用，不在服务端渲染时累加——那样会把爬虫和预取都算进去，
 * 而且页面一旦上了缓存就再也不涨了。
 */
export const POST: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("id 无效", { status: 400 });
  }

  const row = await bumpViews(db(), id);
  return Response.json({ count: row?.count ?? 0 });
};
