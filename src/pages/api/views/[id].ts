import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import { bumpViews, getViews } from "@/lib/db";
import { clientKey, hit } from "@/lib/ratelimit";

/**
 * 浏览量自增。
 *
 * 由页面上的脚本调用，不在服务端渲染时累加——那样会把爬虫和预取都算进去，
 * 而且页面一旦上了缓存就再也不涨了。
 *
 * 同一个 IP 对同一篇 24 小时内只算一次：否则刷新一次涨一次，这个数字
 * 就只是「你自己按了几下 F5」。复用评论和登录那套限流表；超出配额时
 * 照常返回当前计数，页面上看不出区别。
 */

/** 24 小时内同一个人对同一篇只计一次 */
const LIMIT = 1;
const WINDOW_SECONDS = 24 * 60 * 60;

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("id 无效", { status: 400 });
  }

  const database = db();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = await clientKey(`view:${id}`, ip, env.SESSION_SECRET);
  const { allowed } = await hit(database, key, LIMIT, WINDOW_SECONDS);

  const row = allowed
    ? await bumpViews(database, id)
    : await getViews(database, id);

  return Response.json({ count: row?.count ?? 0 });
};
