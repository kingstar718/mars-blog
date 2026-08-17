import type { D1Database } from "@cloudflare/workers-types";
import { now } from "./datetime";

/**
 * 评论（v3）：按文章 slug 关联。
 * 旧 comments 表按数字 entry_id，帖子改 slug 后无法复用，
 * 新表 post_comments 建表语句见 scripts/d1-schema.sql。
 */

export interface CommentRow {
  id: number;
  entry_slug: string;
  author: string;
  body: string;
  status: "pending" | "approved" | "spam";
  created_at: string;
}

/** 读者只看得到审核通过的 */
export const listApproved = (db: D1Database, slug: string) =>
  db
    .prepare(
      `SELECT id, entry_slug, author, body, status, created_at FROM post_comments
       WHERE entry_slug = ?1 AND status = 'approved'
       ORDER BY created_at`
    )
    .bind(slug)
    .all<CommentRow>();

/** 站长视图：包含待审与垃圾，评论审核用 */
export const listAll = (db: D1Database, slug: string) =>
  db
    .prepare(
      `SELECT id, entry_slug, author, body, status, created_at FROM post_comments
       WHERE entry_slug = ?1
       ORDER BY created_at`
    )
    .bind(slug)
    .all<CommentRow>();

/** 新评论一律 pending。没有审核就没有防垃圾，这是最低成本的那道闸 */
export const createComment = (
  db: D1Database,
  slug: string,
  author: string,
  body: string
) =>
  db
    .prepare(
      `INSERT INTO post_comments (entry_slug, author, body, status, created_at)
       VALUES (?1, ?2, ?3, 'pending', ?4)`
    )
    .bind(slug, author, body, now())
    .run();

export const setCommentStatus = (
  db: D1Database,
  id: number,
  status: "approved" | "spam"
) =>
  db
    .prepare(`UPDATE post_comments SET status = ?2 WHERE id = ?1`)
    .bind(id, status)
    .run();
