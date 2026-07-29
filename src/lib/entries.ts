import type { EntryRow } from "./db";
import { nowUtc } from "./datetime";
import { entryInputSchema, type DraftInput } from "./schema";

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
  const now = nowUtc();
  const row = await db
    .prepare(
      `INSERT INTO entries
         (kind, slug, title, description, body, pub_datetime, status,
          featured, ai_generated, canonical_url, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8, ?9, ?10, ?10)
       RETURNING *`
    )
    .bind(
      input.kind,
      input.slug || null,
      input.title || null,
      input.description || null,
      input.body,
      input.pubDatetime || now,
      input.featured ? 1 : 0,
      boolToInt(input.aiGenerated),
      input.canonicalURL || null,
      now
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
      `UPDATE entries SET
         slug = ?2, title = ?3, description = ?4, body = ?5,
         pub_datetime = COALESCE(?6, pub_datetime),
         featured = ?7, ai_generated = ?8, canonical_url = ?9, updated_at = ?10
       WHERE id = ?1
       RETURNING *`
    )
    .bind(
      id,
      input.slug || null,
      input.title || null,
      input.description || null,
      input.body,
      input.pubDatetime || null,
      input.featured ? 1 : 0,
      boolToInt(input.aiGenerated),
      input.canonicalURL || null,
      nowUtc()
    )
    .first<EntryRow>();

export const deleteEntry = (db: D1Database, id: number) =>
  db.prepare(`DELETE FROM entries WHERE id = ?1`).bind(id).run();

/** 把数据库行还原成 zod 认识的形状 */
const rowToInput = (row: EntryRow) =>
  row.kind === "note"
    ? { kind: "note" as const, body: row.body, pubDatetime: row.pub_datetime }
    : {
        kind: "post" as const,
        slug: row.slug ?? "",
        title: row.title ?? "",
        description: row.description ?? "",
        body: row.body,
        pubDatetime: row.pub_datetime,
        featured: row.featured === 1,
        aiGenerated: row.ai_generated === 1,
        ...(row.canonical_url ? { canonicalURL: row.canonical_url } : {}),
      };

export interface PublishResult {
  ok: boolean;
  /** 字段名 -> 错误信息，直接摊给编辑器显示 */
  errors?: Record<string, string>;
}

/**
 * 发布。
 *
 * 三件事在一批里做完，避免中途失败留下半截状态：
 * 快照进 entry_revisions（git 历史的替代品）、追加一条更新记录、置为已发布。
 */
export const publishEntry = async (
  db: D1Database,
  row: EntryRow,
  options: { agent: string; note?: string }
): Promise<PublishResult> => {
  const parsed = entryInputSchema.safeParse(rowToInput(row));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "_"] = issue.message;
    }
    return { ok: false, errors };
  }

  const isFirstPublish = row.status === "draft";
  const now = nowUtc();

  // 更新记录必须自动填。让人手填四个字段的话，两周之内这个字段就废了。
  const action = isFirstPublish ? "创建" : "修改";
  const note = isFirstPublish ? "初次发布" : options.note?.trim() || "内容更新";

  await db.batch([
    db
      .prepare(
        `INSERT INTO entry_revisions (entry_id, body, frontmatter_json, created_at)
         VALUES (?1, ?2, ?3, ?4)`
      )
      .bind(row.id, row.body, JSON.stringify(parsed.data), now),
    db
      .prepare(
        `INSERT INTO entry_updates (entry_id, datetime, action, note, agent)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(row.id, now, action, note, options.agent),
    db
      .prepare(
        `UPDATE entries SET status = 'published', updated_at = ?2 WHERE id = ?1`
      )
      .bind(row.id, now),
  ]);

  return { ok: true };
};

export const unpublishEntry = (db: D1Database, id: number) =>
  db
    .prepare(
      `UPDATE entries SET status = 'draft', updated_at = ?2 WHERE id = ?1`
    )
    .bind(id, nowUtc())
    .run();
