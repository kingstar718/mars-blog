import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";

/**
 * 图片代理：/media/<uid>/<宽度>.<扩展名> → R2 图片桶。
 * URL 与旧站保持一致；key 里带 uid，内容不可变，一年 immutable 缓存。
 *
 * 短引用 /media/<uid> 也接受：正文里存的是 `![](/media/<uid>)`，
 * 渲染时没有尺寸信息，这里按 uid 列出桶，取 ≤800 的最大 jpg 兜底
 *（1600 只归档不下发；webp 仅在没有 jpg 时兜底）。
 */
export const onRequestGet: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  // [[path]] 通配在 Pages 运行时是数组，例如 /a/b.webp → ["a", "b.webp"]
  const segments = params.path as string[] | undefined;
  const key = Array.isArray(segments) ? segments.join("/") : segments;
  if (!key || key.includes("..") || key.startsWith("_meta/"))
    return new Response("not found", { status: 404 });

  // 短引用（无扩展名）的解析结果缓存：每次列桶一次太贵，
  // uid 内容不可变，缓存一年没有风险。带尺寸的 URL 是直接 key，不用走这里。
  const isShort = !key.includes(".");
  let cache: Cache | null = null;
  if (isShort) {
    cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
  }

  let object = await env.MEDIA.get(key);
  // 短引用：没有扩展名说明只有一个 uid，到桶里找该 uid 下 ≤800 的最大 jpg
  if (!object && isShort) {
    const listed = await env.MEDIA.list({ prefix: `${key}/`, limit: 1000 });
    const resolved = listed.objects
      .map(item => item.key)
      .map(item => ({
        key: item,
        width: Number(item.match(/(\d+)\./)?.[1] ?? 0),
      }))
      .filter(v => v.width > 0)
      .sort((a, b) => {
        const aNear = a.width <= 800 ? 1 : 0;
        const bNear = b.width <= 800 ? 1 : 0;
        if (aNear !== bNear) return bNear - aNear;
        if (a.width !== b.width) return b.width - a.width;
        // 同宽优先 jpg（主档）
        return Number(b.key.endsWith(".jpg")) - Number(a.key.endsWith(".jpg"));
      })[0];
    if (resolved) object = await env.MEDIA.get(resolved.key);
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
