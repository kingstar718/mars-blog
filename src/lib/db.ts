/** entries 表的行。字段与 migrations/0001_init.sql 对应。 */
export interface EntryRow {
  id: number;
  kind: "post" | "note";
  title: string | null;
  body: string;
  pub_datetime: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  /** 发布时渲染好的正文 HTML，草稿为 null */
  body_html: string | null;
  /** 发布时抽出的标题，[{ depth, slug, text }]，草稿为 null */
  headings_json: string | null;
}

export const countPublished = (
  db: D1Database,
  kind?: "post" | "note",
  includeDrafts = false
) =>
  (kind
    ? db
        .prepare(
          `SELECT COUNT(*) AS n FROM entries
           WHERE (status = 'published' OR ?2) AND kind = ?1`
        )
        .bind(kind, includeDrafts ? 1 : 0)
    : db
        .prepare(
          `SELECT COUNT(*) AS n FROM entries WHERE status = 'published' OR ?1`
        )
        .bind(includeDrafts ? 1 : 0)
  ).first<{ n: number }>();

/** 按类型分页取已发布内容，走 idx_entries_kind */
export const listPublishedByKind = (
  db: D1Database,
  kind: "post" | "note",
  limit: number,
  offset = 0,
  includeDrafts = false
) =>
  db
    .prepare(
      `SELECT * FROM entries
       WHERE (status = 'published' OR ?4) AND kind = ?1
       ORDER BY pub_datetime DESC
       LIMIT ?2 OFFSET ?3`
    )
    .bind(kind, limit, offset, includeDrafts ? 1 : 0)
    .all<EntryRow>();

/** 按年分组的条数，列表页尾部的统计用 */
export const countByYear = (db: D1Database, kind: "post" | "note") =>
  db
    .prepare(
      `SELECT substr(pub_datetime, 1, 4) AS year, COUNT(*) AS n
       FROM entries
       WHERE status = 'published' AND kind = ?1
       GROUP BY year
       ORDER BY year DESC`
    )
    .bind(kind)
    .all<{ year: string; n: number }>();

/** 后台列表：草稿和已发布都要，草稿排在前面方便接着写 */
export const listAllForAdmin = (db: D1Database) =>
  db
    .prepare(
      `SELECT * FROM entries
       ORDER BY (status = 'draft') DESC, updated_at DESC`
    )
    .all<EntryRow>();

export const getPostById = (
  db: D1Database,
  id: number,
  /** 登录时草稿也能打开：草稿的编辑入口就是它自己的文章页 */
  includeDrafts = false
) =>
  db
    .prepare(
      `SELECT * FROM entries
       WHERE kind = 'post' AND id = ?1 AND (status = 'published' OR ?2)`
    )
    .bind(id, includeDrafts ? 1 : 0)
    .first<EntryRow>();

/**
 * 浏览量自增。
 *
 * 必须是这一句 UPSERT，不能拆成「读 + 写」两步，更不能换成 KV：
 * KV 最终一致且没有原子自增，并发访问会丢更新。
 */
export const bumpViews = (db: D1Database, entryId: number) =>
  db
    .prepare(
      `INSERT INTO views (entry_id, count) VALUES (?1, 1)
       ON CONFLICT (entry_id) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(entryId)
    .first<{ count: number }>();

/** 只读当前浏览量，给「这次不计数」的分支用 */
export const getViews = (db: D1Database, entryId: number) =>
  db
    .prepare(`SELECT count FROM views WHERE entry_id = ?1`)
    .bind(entryId)
    .first<{ count: number }>();

/** 「近 N 天写了几条随记」——关于页那两行动态提示用 */
export const countNotesSince = (db: D1Database, since: string) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM entries
       WHERE kind = 'note' AND status = 'published' AND pub_datetime >= ?1`
    )
    .bind(since)
    .first<{ n: number }>();

/** 最近一条已发布的内容，kind 决定是文章还是随记 */
export const getLatest = (db: D1Database, kind: "post" | "note") =>
  db
    .prepare(
      `SELECT * FROM entries
       WHERE kind = ?1 AND status = 'published'
       ORDER BY pub_datetime DESC
       LIMIT 1`
    )
    .bind(kind)
    .first<EntryRow>();
