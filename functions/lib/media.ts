import type { Env } from "../env";

export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  format: "webp" | "jpeg";
}

/** 短引用选档规则，与 scripts/rehype-media.mjs 保持一致：
 *  主档 jpeg——只要有一张 jpeg，整组只用 jpeg；整组只有 webp 才用 webp。
 *  组内只考虑 ≤800 的档并取最大；没有 ≤800 档视为无解（1600 只归档不下发）。 */
export const pickFallback = (variants: MediaVariant[]): MediaVariant | null => {
  const preferred = variants.filter(v => v.format === "jpeg");
  const group = preferred.length > 0 ? preferred : variants;
  const served = group
    .filter(v => v.width > 0 && v.width <= 800)
    .sort((a, b) => b.width - a.width);
  return served[0] ?? null;
};

/** 短引用兜底解析：先读 _meta/<uid>.json（一次 GET，还带 height），
 *  缺清单或清单损坏时退回列桶 + 从文件名猜宽度。 */
export const resolveFallback = async (
  env: Env,
  uid: string
): Promise<string | null> => {
  const meta = await env.MEDIA.get(`_meta/${uid}.json`);
  if (meta) {
    try {
      const parsed = (await meta.json()) as { variants?: MediaVariant[] };
      const picked = pickFallback(parsed.variants ?? []);
      if (picked) return picked.key;
    } catch {
      // 清单解析失败就退回列桶
    }
  }

  const listed = await env.MEDIA.list({ prefix: `${uid}/`, limit: 1000 });
  const variants: MediaVariant[] = listed.objects
    .map(
      (object): MediaVariant => ({
        key: object.key,
        width: Number(object.key.match(/(\d+)\./)?.[1] ?? 0),
        height: 0,
        format: object.key.endsWith(".webp") ? "webp" : "jpeg",
      })
    )
    .filter(v => v.width > 0);
  return pickFallback(variants)?.key ?? null;
};
