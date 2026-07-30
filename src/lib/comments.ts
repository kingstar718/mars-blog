import { now } from "./datetime";

export interface CommentRow {
  id: number;
  entry_id: number;
  author: string;
  body: string;
  status: "pending" | "approved" | "spam";
  created_at: string;
}

/** 读者只看得到审核通过的 */
export const listApproved = (db: D1Database, entryId: number) =>
  db
    .prepare(
      `SELECT * FROM comments
       WHERE entry_id = ?1 AND status = 'approved'
       ORDER BY created_at`
    )
    .bind(entryId)
    .all<CommentRow>();

/**
 * 作者自己看的那一份：待审的也列出来，跟通过的混在同一条时间线上。
 * 待审评论只在有会话时才会查（边缘缓存对带会话的请求一律绕开），
 * 不会漏给读者。垃圾评论不再露面。
 */
export const listForOwner = (db: D1Database, entryId: number) =>
  db
    .prepare(
      `SELECT * FROM comments
       WHERE entry_id = ?1 AND status IN ('approved', 'pending')
       ORDER BY created_at`
    )
    .bind(entryId)
    .all<CommentRow>();

export const listPending = (db: D1Database) =>
  db
    .prepare(
      `SELECT * FROM comments WHERE status = 'pending' ORDER BY created_at DESC`
    )
    .all<CommentRow>();

/** 新评论一律 pending。没有审核就没有防垃圾，这是最低成本的那道闸 */
export const createComment = (
  db: D1Database,
  entryId: number,
  author: string,
  body: string
) =>
  db
    .prepare(
      `INSERT INTO comments (entry_id, author, body, status, created_at)
       VALUES (?1, ?2, ?3, 'pending', ?4)`
    )
    .bind(entryId, author, body, now())
    .run();

export const setCommentStatus = (
  db: D1Database,
  id: number,
  status: "approved" | "spam"
) =>
  db
    .prepare(`UPDATE comments SET status = ?2 WHERE id = ?1`)
    .bind(id, status)
    .run();
