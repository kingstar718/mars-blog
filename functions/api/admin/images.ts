import { z } from "zod";
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { jsonError } from "../../lib/http";
import { MAX_IMAGE_REQUEST_BYTES } from "../../lib/input";

/** 单张图片上限：浏览器端已压过尺寸，正常远小于此，只防异常请求 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const variantSchema = z.object({
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  format: z.enum(["webp", "jpeg"]),
});
const metasSchema = z.array(variantSchema).min(1).max(12);

type VariantMeta = z.infer<typeof variantSchema>;

const extensionOf = (format: VariantMeta["format"]) =>
  format === "webp" ? "webp" : "jpg";

/**
 * 接收浏览器压好的多尺寸图片，写入 MEDIA 桶。
 * 会话校验由 functions/api/admin/_middleware.ts 统一负责。
 *
 * FormData 而不是 JSON+base64：base64 会让传输量涨三分之一。
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_IMAGE_REQUEST_BYTES
  ) {
    return jsonError("图片请求太大", 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("表单格式不对");

  const rawMeta = form.get("meta");
  if (typeof rawMeta !== "string") return jsonError("缺少 meta");

  let metas: VariantMeta[];
  try {
    const parsed = metasSchema.safeParse(JSON.parse(rawMeta));
    if (!parsed.success) return jsonError("meta 字段不合法");
    metas = parsed.data;
  } catch {
    return jsonError("meta 不是合法 JSON");
  }

  const uid = crypto.randomUUID();
  const variants: {
    key: string;
    width: number;
    height: number;
    format: string;
  }[] = [];
  const files: { file: File; meta: VariantMeta }[] = [];
  let totalBytes = 0;

  for (const [index, meta] of metas.entries()) {
    const file = form.get(`file${index}`);
    if (!(file instanceof File)) return jsonError(`缺少 file${index}`);
    if (file.size > MAX_IMAGE_BYTES) {
      return jsonError(`file${index} 超过 10MB`, 413);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_IMAGE_REQUEST_BYTES) {
      return jsonError("图片请求太大", 413);
    }
    const expectedType = meta.format === "webp" ? "image/webp" : "image/jpeg";
    if (file.type && file.type !== expectedType) {
      return jsonError(`file${index} 格式不匹配`);
    }
    files.push({ file, meta });
  }

  const uploadedKeys: string[] = [];
  const metaKey = `_meta/${uid}.json`;
  try {
    for (const { file, meta } of files) {
      const key = `${uid}/${meta.width}.${extensionOf(meta.format)}`;
      await env.MEDIA.put(key, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: meta.format === "webp" ? "image/webp" : "image/jpeg",
          // key 里带 uid，内容永不变，可以放心让浏览器长期缓存
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      uploadedKeys.push(key);
      variants.push({ key, ...meta });
    }

    // 把变体清单写进桶，构建期 sync-content 拉下来生成 media manifest，
    // rehype 据此把短引用重写成响应式 <img>（srcset/尺寸/lazy）。
    await env.MEDIA.put(metaKey, JSON.stringify({ uid, variants }), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (error) {
    await Promise.all([
      ...uploadedKeys.map(key => env.MEDIA.delete(key)),
      env.MEDIA.delete(metaKey),
    ]);
    console.error("Image upload failed", error);
    return jsonError("图片上传失败", 502);
  }

  return Response.json({ uid, markdown: `![](/media/${uid})`, variants });
};
