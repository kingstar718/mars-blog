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
  const slug = params.slug;
  if (!slug) return new Response("缺少 slug", { status: 400 });

  const row = await bumpViews(db(), slug);
  return Response.json({ count: row?.count ?? 0 });
};
