import type { APIRoute } from "astro";
import { db, media } from "@/lib/env";
import { extensionOf, recordImage, type ImageVariant } from "@/lib/images";

interface VariantMeta {
  width: number;
  height: number;
  format: "webp" | "jpeg";
}

/**
 * 接收浏览器压好的多个尺寸。
 *
 * 用 FormData 而不是 JSON+base64：base64 会让传输量涨三分之一，
 * 一张图六个变体的话这个开销很实在。
 */
export const POST: APIRoute = async ({ request }) => {
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
  const bucket = media();
  const variants: ImageVariant[] = [];

  for (const [index, meta] of metas.entries()) {
    const file = form.get(`file${index}`);
    if (!(file instanceof File)) {
      return new Response(`缺少 file${index}`, { status: 400 });
    }

    const key = `${uid}/${meta.width}.${extensionOf(meta.format)}`;
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: meta.format === "webp" ? "image/webp" : "image/jpeg",
        // key 里带 uid，内容永不变，可以放心让浏览器长期缓存
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    variants.push({ key, ...meta });
  }

  await recordImage(db(), uid, variants);

  // 直接给出可以粘进正文的 markdown
  return Response.json({ uid, markdown: `![](/media/${uid})`, variants });
};
