import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";

interface VariantMeta {
  width: number;
  height: number;
  format: "webp" | "jpeg";
}

const extensionOf = (format: string) => (format === "webp" ? "webp" : "jpg");

/**
 * 接收浏览器压好的多尺寸图片，写入 MEDIA 桶。
 * 会话校验由 functions/api/admin/_middleware.ts 统一负责。
 *
 * FormData 而不是 JSON+base64：base64 会让传输量涨三分之一。
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  const rawMeta = form.get("meta");
  if (typeof rawMeta !== "string") {
    return new Response("缺少 meta", { status: 400 });
  }

  let metas: VariantMeta[];
  try {
    metas = JSON.parse(rawMeta);
  } catch {
    return new Response("meta 不是合法 JSON", { status: 400 });
  }
  if (metas.length === 0) return new Response("没有变体", { status: 400 });

  const uid = crypto.randomUUID();
  const variants: {
    key: string;
    width: number;
    height: number;
    format: string;
  }[] = [];

  for (const [index, meta] of metas.entries()) {
    const file = form.get(`file${index}`);
    if (!(file instanceof File)) {
      return new Response(`缺少 file${index}`, { status: 400 });
    }

    const key = `${uid}/${meta.width}.${extensionOf(meta.format)}`;
    await env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: meta.format === "webp" ? "image/webp" : "image/jpeg",
        // key 里带 uid，内容永不变，可以放心让浏览器长期缓存
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    variants.push({ key, ...meta });
  }

  // 把变体清单写进桶，构建期 sync-content 拉下来生成 media manifest，
  // rehype 据此把短引用重写成响应式 <img>（srcset/尺寸/lazy）。
  await env.MEDIA.put(`_meta/${uid}.json`, JSON.stringify({ uid, variants }), {
    httpMetadata: { contentType: "application/json" },
  });

  return Response.json({ uid, markdown: `![](/media/${uid})`, variants });
};
