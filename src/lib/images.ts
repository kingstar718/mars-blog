import { nowUtc } from "./datetime";

/**
 * 图片记录。
 *
 * 正文里存的是 `/media/<id>` 这种短引用，不是 R2 的完整 URL——
 * markdown 的 ![]() 塞不下 srcset，所以渲染时再按 id 查出所有尺寸，
 * 拼成带 srcset 和宽高的 <img>。换域名、换存储也只用改渲染那一处。
 */

export interface ImageVariant {
  key: string;
  width: number;
  height: number;
  format: "webp" | "jpeg";
}

export interface ImageRow {
  id: number;
  entry_id: number | null;
  r2_key: string;
  variants: string;
  created_at: string;
}

export interface StoredImage {
  /** 正文引用用的公开 id，同时也是 R2 里的目录名 */
  uid: string;
  variants: ImageVariant[];
}

export const extensionOf = (format: ImageVariant["format"]) =>
  format === "webp" ? "webp" : "jpg";

export const contentTypeOf = (key: string) =>
  key.endsWith(".webp") ? "image/webp" : "image/jpeg";

export const recordImage = async (
  db: D1Database,
  uid: string,
  variants: ImageVariant[]
) => {
  await db
    .prepare(
      `INSERT INTO images (r2_key, variants, created_at) VALUES (?1, ?2, ?3)`
    )
    .bind(uid, JSON.stringify(variants), nowUtc())
    .run();
};

export const getImage = async (
  db: D1Database,
  uid: string
): Promise<StoredImage | null> => {
  const row = await db
    .prepare(`SELECT * FROM images WHERE r2_key = ?1`)
    .bind(uid)
    .first<ImageRow>();
  if (!row) return null;
  return { uid: row.r2_key, variants: JSON.parse(row.variants) };
};

/** 挑一个兜底展示用的变体：最大的 jpeg，没有就最大的那个 */
export const fallbackVariant = (variants: ImageVariant[]) => {
  const sorted = [...variants].sort((a, b) => b.width - a.width);
  return sorted.find(variant => variant.format === "jpeg") ?? sorted[0];
};
