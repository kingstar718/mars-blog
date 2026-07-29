/** entries 表的行。字段与 migrations/0001_init.sql 对应。 */
export interface EntryRow {
  id: number;
  kind: "post" | "note";
  slug: string | null;
  title: string | null;
  description: string | null;
  body: string;
  pub_datetime: string;
  status: "draft" | "published";
  featured: number;
  ai_generated: number | null;
  canonical_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryUpdateRow {
  id: number;
  entry_id: number;
  datetime: string;
  action: string;
  note: string;
  agent: string;
}

/**
 * 时间线：文章和短文混排，按发布时间倒序。
 * 走 idx_entries_timeline 索引。
 */
export const listPublished = (db: D1Database, limit: number, offset = 0) =>
  db
    .prepare(
      `SELECT * FROM entries
       WHERE status = 'published'
       ORDER BY pub_datetime DESC
       LIMIT ?1 OFFSET ?2`
    )
    .bind(limit, offset)
    .all<EntryRow>();

export const countPublished = (db: D1Database, kind?: "post" | "note") =>
  (kind
    ? db
        .prepare(
          `SELECT COUNT(*) AS n FROM entries WHERE status = 'published' AND kind = ?1`
        )
        .bind(kind)
    : db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE status = 'published'`)
  ).first<{ n: number }>();

/** 后台列表：草稿和已发布都要，草稿排在前面方便接着写 */
export const listAllForAdmin = (db: D1Database) =>
  db
    .prepare(
      `SELECT * FROM entries
       ORDER BY (status = 'draft') DESC, updated_at DESC`
    )
    .all<EntryRow>();

export const getPostBySlug = (db: D1Database, slug: string) =>
  db
    .prepare(
      `SELECT * FROM entries WHERE kind = 'post' AND slug = ?1 AND status = 'published'`
    )
    .bind(slug)
    .first<EntryRow>();

export const getUpdates = (db: D1Database, entryId: number) =>
  db
    .prepare(
      `SELECT * FROM entry_updates WHERE entry_id = ?1 ORDER BY datetime DESC`
    )
    .bind(entryId)
    .all<EntryUpdateRow>();

/**
 * 浏览量自增。
 *
 * 必须是这一句 UPSERT，不能拆成「读 + 写」两步，更不能换成 KV：
 * KV 最终一致且没有原子自增，并发访问会丢更新。
 */
export const bumpViews = (db: D1Database, slug: string) =>
  db
    .prepare(
      `INSERT INTO views (slug, count) VALUES (?1, 1)
       ON CONFLICT (slug) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(slug)
    .first<{ count: number }>();
