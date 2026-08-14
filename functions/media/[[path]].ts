import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";

/**
 * 图片代理：/media/<uid>/<宽度>.<扩展名> → R2 图片桶。
 * URL 与旧站保持一致；key 里带 uid，内容不可变，一年 immutable 缓存。
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const key = params.path as string | undefined;
  if (!key || key.includes(".."))
    return new Response("not found", { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("not found", { status: 404 });

  const type = key.endsWith(".webp")
    ? "image/webp"
    : key.endsWith(".jpg") || key.endsWith(".jpeg")
      ? "image/jpeg"
      : "application/octet-stream";

  return new Response(object.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
