import type { APIRoute } from "astro";
import { db, media } from "@/lib/env";
import { contentTypeOf, fallbackVariant, getImage } from "@/lib/images";

/**
 * 图片出口。桶保持私有，一律经这里读。
 *
 * 两种形态：
 *   /media/<uid>                 → 最大的 jpeg，给不认识 srcset 的地方兜底
 *   /media/<uid>/<宽度>.<扩展名>  → 指定变体，srcset 里用的就是这些
 *
 * 也可以给 R2 挂自定义域名让 CDN 直接回源，省掉 Worker 调用。
 * 现在没这么做：桶要转公开，而且多一个域名要管。key 里带 uid，
 * 内容不可变，加上一年的 immutable 缓存后回源次数本来就极少。
 */

const immutable = {
  "cache-control": "public, max-age=31536000, immutable",
};

export const GET: APIRoute = async ({ params }) => {
  const path = params.path;
  if (!path) return new Response("缺少路径", { status: 400 });

  const segments = path.split("/");
  const uid = segments[0];

  // 指定变体：直接按 key 取，不用查库
  if (segments.length === 2) {
    const key = `${uid}/${segments[1]}`;
    const object = await media().get(key);
    if (!object) return new Response("图片不存在", { status: 404 });
    return new Response(object.body, {
      headers: { ...immutable, "content-type": contentTypeOf(key) },
    });
  }

  if (segments.length !== 1) return new Response("路径不合法", { status: 400 });

  const image = await getImage(db(), uid);
  if (!image) return new Response("图片不存在", { status: 404 });

  const variant = fallbackVariant(image.variants);
  const object = await media().get(variant.key);
  if (!object) return new Response("图片不存在", { status: 404 });

  return new Response(object.body, {
    headers: { ...immutable, "content-type": contentTypeOf(variant.key) },
  });
};
