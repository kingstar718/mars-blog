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
    .bind(entryId, author, body, new Date().toISOString())
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
