import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";
import { joinPath } from "../lib/path";
import { resolveFallback } from "../lib/media";

/**
 * 图片代理：/media/<uid>/<宽度>.<扩展名> → R2 图片桶。
 * URL 与旧站保持一致；key 里带 uid，内容不可变，一年 immutable 缓存。
 *
 * 短引用 /media/<uid> 也接受：正文里存的是 `![](/media/<uid>)`，
 * 渲染时没有尺寸信息，这里按统一规则（见 lib/media.ts）解析 ≤800 主档
 *（1600 只归档不下发；没有 ≤800 档返回 404）。
 */
export const onRequestGet: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  const key = joinPath(params.path);
  if (!key || key.includes("..") || key.startsWith("_meta/"))
    return new Response("not found", { status: 404 });

  // 短引用（无扩展名）的解析结果缓存：每次解析（读清单或列桶）一次太贵，
  // uid 内容不可变，缓存一年没有风险。带尺寸的 URL 是直接 key，不用走这里。
  const isShort = !key.includes(".");
  let cache: Cache | null = null;
  if (isShort) {
    cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
  }

  let object = await env.MEDIA.get(key);
  // 短引用：没有扩展名说明只有一个 uid，按统一规则解析 ≤800 主档
  if (!object && isShort) {
    const resolved = await resolveFallback(env, key);
    if (resolved) object = await env.MEDIA.get(resolved);
  }
  if (!object) return new Response("not found", { status: 404 });

  const type = object.key.endsWith(".webp")
    ? "image/webp"
    : object.key.endsWith(".jpg") || object.key.endsWith(".jpeg")
      ? "image/jpeg"
      : "application/octet-stream";

  const response = new Response(object.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  if (cache) {
    // 只缓存短引用的响应本身（含 immutable 头），带尺寸的 URL 交给 CDN
    await cache.put(request, response.clone());
  }
  return response;
};
