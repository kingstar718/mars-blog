import type { EntryRow } from "./db";
import { now } from "./datetime";
import { entryInputSchema, type DraftInput } from "./schema";
import { extractImageUids, renderMarkdown } from "./render";
import { getImage, type StoredImage } from "./images";

/**
 * 草稿的读写与发布。
 *
 * 分两档校验：写草稿几乎不校验（写到一半被拦住是最恼人的事），
 * 发布时才跑完整的 zod。这对应旧站「构建期才校验 frontmatter」的位置。
 */

export const getEntry = (db: D1Database, id: number) =>
  db.prepare(`SELECT * FROM entries WHERE id = ?1`).bind(id).first<EntryRow>();

const boolToInt = (value: boolean | undefined) =>
  value === undefined ? null : value ? 1 : 0;

export const createDraft = async (db: D1Database, input: DraftInput) => {
  // 草稿先记下建档时间占位，真正的发布时间在 publishEntry 里盖
  const stamp = now();
  const row = await db
    .prepare(
      `INSERT INTO entries
         (kind, title, body, pub_datetime, status,
          ai_generated, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?6)
       RETURNING *`
    )
    .bind(
      input.kind,
      input.title || null,
      input.body,
      stamp,
      boolToInt(input.aiGenerated),
      stamp
    )
    .first<EntryRow>();
  return row!;
};

export const updateDraft = async (
  db: D1Database,
  id: number,
  input: DraftInput
) =>
  db
    .prepare(
      // pub_datetime 不在这里改：自动保存每 1.2 秒跑一次，
      // 让它碰发布时间的话，改个错别字就会把文章顶到时间线最上面
      `UPDATE entries SET
         title = ?2, body = ?3,
         ai_generated = ?4, updated_at = ?5
       WHERE id = ?1
       RETURNING *`
    )
    .bind(
      id,
      input.title || null,
      input.body,
      boolToInt(input.aiGenerated),
      now()
    )
    .first<EntryRow>();

export const deleteEntry = (db: D1Database, id: number) =>
  db.prepare(`DELETE FROM entries WHERE id = ?1`).bind(id).run();

/** 把数据库行还原成 zod 认识的形状。pubDatetime 单独传，首次发布时它是新盖的戳 */
const rowToInput = (row: EntryRow, pubDatetime: string) =>
  row.kind === "note"
    ? { kind: "note" as const, body: row.body, pubDatetime }
    : {
        kind: "post" as const,
        title: row.title ?? "",
        body: row.body,
        pubDatetime,
        aiGenerated: row.ai_generated === 1,
      };

export interface PublishResult {
  ok: boolean;
  /** 字段名 -> 错误信息，直接摊给编辑器显示 */
  errors?: Record<string, string>;
}

/** 发布：渲染正文，置为已发布，首次发布时盖上发布时间。 */
export const publishEntry = async (
  db: D1Database,
  row: EntryRow
): Promise<PublishResult> => {
  // 「首次发布」看的是有没有发过的痕迹，不是当前状态：
  // 撤回之后再发出去不该被当成第一次，发布时间也不该被重置。
  //
  // 依据是 body_html：它只在发布时写入，撤回和存草稿都不会清空，
  // 所以「从来没发过」等价于「body_html 是 NULL」。
  const isFirstPublish = row.body_html === null;

  const stamp = now();
  // 发布时间即按下发布的那一刻，之后再更新不会变
  const pubDatetime = isFirstPublish ? stamp : row.pub_datetime;

  const parsed = entryInputSchema.safeParse(rowToInput(row, pubDatetime));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "_"] = issue.message;
    }
    return { ok: false, errors };
  }

  const html = await renderEntryBody(db, row.body);

  await db
    .prepare(
      `UPDATE entries SET status = 'published', updated_at = ?2, body_html = ?3,
                          pub_datetime = ?4
       WHERE id = ?1`
    )
    .bind(row.id, stamp, html, pubDatetime)
    .run();

  return { ok: true };
};

/**
 * 渲染正文，顺带把 /media/<uid> 展开成带 srcset 的图片。
 *
 * 图片要先查出来喂给渲染器——正文里只有短引用，尺寸信息在 images 表里。
 */
export const renderEntryBody = async (db: D1Database, markdown: string) => {
  const uids = extractImageUids(markdown);
  const images = new Map<string, StoredImage>();
  for (const uid of uids) {
    const image = await getImage(db, uid);
    if (image) images.set(uid, image);
  }
  return renderMarkdown(markdown, images);
};

export const unpublishEntry = (db: D1Database, id: number) =>
  db
    .prepare(
      `UPDATE entries SET status = 'draft', updated_at = ?2 WHERE id = ?1`
    )
    .bind(id, now())
    .run();
