import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import { bumpPageView, getPageView } from "@/lib/db";
import { clientKey, hit } from "@/lib/ratelimit";

/**
 * 浏览量自增，按路径。
 *
 * 由页面上的脚本调用，不在服务端渲染时累加——那样会把爬虫和预取都算进去，
 * 而且页面一旦上了缓存就再也不涨了。
 *
 * 同一个 IP 对同一个路径 24 小时内只算一次：否则刷新一次涨一次，这个数字
 * 就只是「你自己按了几下 F5」。复用评论和登录那套限流表；超出配额时
 * 照常返回当前计数，页面上看不出区别。
 */

/** 24 小时内同一个人对同一个地址只计一次 */
const LIMIT = 1;
const WINDOW_SECONDS = 24 * 60 * 60;

/**
 * 允许计数的地址形状。
 *
 * 白名单而不是黑名单：body 里的 path 是客户端给的，不校验的话
 * 任何人都能往表里插任意字符串，把它撑成一张垃圾表。
 * 这里同时排掉了 /login、/api/*、404 和带 query 的地址。
 */
const COUNTABLE = /^\/$|^\/(posts|notes)(\/\d+)?$|^\/search$/;

export const POST: APIRoute = async ({ request }) => {
  const { path } = (await request.json().catch(() => ({}))) as {
    path?: unknown;
  };
  if (typeof path !== "string" || !COUNTABLE.test(path)) {
    return new Response("地址不可计数", { status: 400 });
  }

  const database = db();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = await clientKey(`view:${path}`, ip, env.SESSION_SECRET);
  const { allowed } = await hit(database, key, LIMIT, WINDOW_SECONDS);

  const row = allowed
    ? await bumpPageView(database, path)
    : await getPageView(database, path);

  return Response.json({ count: row?.count ?? 0 });
};
