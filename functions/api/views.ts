import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";
import { bumpPageView, getPageView } from "../lib/views";
import { clientKey, hit, LONGEST_WINDOW_SECONDS, sweep } from "../lib/ratelimit";
import { deriveSessionSecret } from "../lib/session";

/**
 * 浏览量自增，按路径。同一个 IP 对同一个路径 24 小时只算一次。
 * 白名单校验路径形状，防止客户端往表里插垃圾。
 */
const LIMIT = 1;
const WINDOW_SECONDS = LONGEST_WINDOW_SECONDS;

const COUNTABLE =
  /^\/$|^\/(posts|notes)(\/page\/\d+)?$|^\/posts\/[^/]+$|^\/search$/;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const { path } = (await request.json().catch(() => ({}))) as {
    path?: unknown;
  };
  if (typeof path !== "string" || !COUNTABLE.test(path)) {
    return new Response("地址不可计数", { status: 400 });
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const secret = await deriveSessionSecret(env.ADMIN_PASSWORD);
  const key = await clientKey(`view:${path}`, ip, secret);
  const { allowed } = await hit(env.DB, key, LIMIT, WINDOW_SECONDS);
  await sweep(env.DB);

  const row = allowed
    ? await bumpPageView(env.DB, path)
    : await getPageView(env.DB, path);
  return Response.json({ count: row?.count ?? 0 });
};
